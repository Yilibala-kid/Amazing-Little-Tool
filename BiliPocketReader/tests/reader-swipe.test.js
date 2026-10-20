const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
    const frames = new Map(), timers = new Map();
    let clock = 0, sequence = 0, reads = 0;
    const context = vm.createContext({
        performance: { now: () => clock },
        requestAnimationFrame(fn) { frames.set(++sequence, fn); return sequence; },
        cancelAnimationFrame(id) { frames.delete(id); },
        setTimeout(fn) { timers.set(++sequence, fn); return sequence; },
        clearTimeout(id) { timers.delete(id); },
        matchMedia: () => ({ matches: false })
    });
    context.window = context;
    context.BilibiliToolbox = { animations: { normalizeAnimationMode: mode => mode || 'parallel' } };
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../reader-swipe.js'), 'utf8'), context);
    const stage = { style: {}, getBoundingClientRect() { reads++; return {}; } };
    const reader = { el: { pageStage: stage, imgContainer: { firstChild: {} }, reader: { clientWidth: 400 } },
        animationMode: 'parallel', scale: 1, currentIndex: 2, displayedIndex: 2, isRightToLeft: false,
        initX: 0, initY: 0, viewportRect: { width: 400 },
        canTurnPage: () => true, clearPendingTap() {}, cancelPreload() {}, setTransformTransition() {},
        getRenderScale: () => 1, getPanLimits: () => ({ maxX: 100, maxY: 100 }),
        clampPanValue: (value, max) => Math.max(-max, Math.min(max, value)), applyTransform() {} };
    const swipe = new context.BilibiliToolbox.ReaderSwipe(reader);
    swipe.schedule = () => {};
    swipe.prepare = () => Promise.resolve(null);
    const event = (x, y = 200) => ({ touches: [{ clientX: x, clientY: y }], preventDefault() {} });
    return { reader, swipe, frames, timers, event, context, stage,
        time: value => { clock = value; }, reads: () => reads,
        flush() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); } };
}

test('release uses relative distance, recent flick speed and reverse-direction cancellation', () => {
    const { context } = fixture();
    const decide = context.BilibiliToolbox.swipeReleaseDecision;
    assert.ok(!decide(90, 0, 400));
    assert.ok(decide(100, 0, 400));
    assert.ok(!decide(100, 0, 844), 'landscape uses its own viewport width');
    assert.ok(decide(-35, -0.8, 400));
    assert.ok(!decide(-15, -2, 400), 'tiny jitter cannot flick');
    assert.ok(!decide(-180, 0.8, 400), 'quick reversal cancels an otherwise long drag');
});

test('touch bursts coalesce into one frame without layout reads; reset cancels all work', () => {
    const h = fixture();
    h.swipe.start(h.event(300));
    for (let i = 0; i < 20; i++) { h.time(i * 2); h.swipe.move(h.event(280 - i * 4)); }
    assert.equal(h.frames.size, 1);
    assert.equal(h.swipe.offset, 0, 'no immediate DOM write per touch event');
    h.flush();
    assert.equal(h.swipe.offset, -96);
    assert.equal(h.stage.style.transform, 'translate3d(-96px,0,0)');
    assert.equal(h.reads(), 0, 'dragging never forces a geometry read');
    h.swipe.end({ type: 'touchcancel' });
    assert.equal(h.timers.size, 1);
    h.swipe.reset();
    assert.equal(h.timers.size, 0);
    assert.equal(h.frames.size, 0);
    assert.equal(h.swipe.offset, 0);
    assert.equal(h.stage.style.transform, '');
});

test('boundary resistance, vertical axis lock and zoom edge handoff stay distinct', () => {
    const h = fixture();
    h.reader.canTurnPage = () => false;
    h.swipe.start(h.event(100)); h.swipe.move(h.event(300)); h.flush();
    assert.ok(h.swipe.offset > 0 && h.swipe.offset < 72);
    h.swipe.reset(); h.reader.suppressRemainingTouch = false;
    h.swipe.start(h.event(100)); h.swipe.move(h.event(110, 350));
    h.swipe.move(h.event(250, 360));
    assert.equal(h.frames.size, 0, 'a vertical gesture cannot switch axes midway');
    h.swipe.reset(); h.reader.suppressRemainingTouch = false;
    Object.assign(h.reader, { scale: 2, initX: 90, canTurnPage: () => true });
    h.swipe.start(h.event(100));
    assert.equal(h.swipe.move(h.event(80)), false, 'movement within the zoomed image remains pan');
    h.swipe.move(h.event(140)); h.flush();
    assert.equal(h.reader.translateX, 100);
    assert.equal(h.swipe.offset, 20, 'only edge overflow after the dead zone moves the page');
});

test('fade and smooth pass through the background without overlapping the page images', () => {
    for (const mode of ['parallel', 'fade', 'smooth']) {
        const h = fixture();
        h.reader.animationMode = mode;
        h.swipe.width = 400;
        const incoming = { style: {} };
        h.swipe.slots.set(1, { stage: incoming });
        h.swipe.gesture = { axis: 'x' };
        h.swipe.write(-100);
        assert.equal(incoming.style.visibility, 'visible');
        if (mode === 'parallel') {
            assert.equal(h.stage.style.opacity, '1');
            assert.equal(h.stage.style.transform, 'translate3d(-100px,0,0)');
        } else {
            assert.equal(h.stage.style.opacity, '0.5');
            assert.equal(incoming.style.opacity, '0');
            if (mode === 'fade') assert.equal(h.stage.style.transform, 'translate3d(0px,0,0)');
            else assert.equal(h.stage.style.transform, 'translate3d(-24px,0,0) scale(0.975)');
            h.swipe.write(-200);
            assert.equal(h.stage.style.opacity, '0');
            assert.equal(incoming.style.opacity, '0', 'midpoint displays the background color');
            h.swipe.write(-300);
            assert.equal(h.stage.style.opacity, '0');
            assert.equal(incoming.style.opacity, '0.5');
            h.swipe.gesture = null;
            h.swipe.animating = true;
            h.swipe.write(0);
            assert.equal(incoming.style.opacity, '0');
            assert.equal(h.stage.style.opacity, '1', 'rollback restores the current image without a crossfade');
        }
    }
});

test('settlement splits at the transparent midpoint and can be stopped between phases', () => {
    const h = fixture();
    h.reader.animationMode = 'fade';
    h.swipe.width = 400;
    const incoming = { style: {} };
    h.swipe.slots.set(1, { stage: incoming });
    h.swipe.write(-80);
    let completed = 0;
    h.swipe.animateTo(-400, 0, () => completed++);
    assert.equal(h.swipe.offset, -200);
    assert.equal(h.stage.style.opacity, '0');
    assert.equal(incoming.style.opacity, '0');
    const [id, callback] = [...h.timers][0];
    h.timers.delete(id); callback();
    h.flush();
    assert.equal(h.swipe.offset, -200, 'one display frame holds the selected background');
    assert.equal(completed, 0);
    assert.equal(h.frames.size, 1);
    h.swipe.stopMotion();
    assert.equal(h.frames.size, 0, 'interruption cancels the pending fade-in');
    assert.equal(h.timers.size, 0);
    h.flush();
    assert.equal(completed, 0);
});

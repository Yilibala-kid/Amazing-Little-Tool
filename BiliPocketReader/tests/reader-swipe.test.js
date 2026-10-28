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

test('release uses a fixed distance, recent flick speed and reverse-direction cancellation', () => {
    const { context } = fixture();
    const decide = context.BilibiliToolbox.swipeReleaseDecision;
    for (const width of [390, 844, 1024, 1366]) {
        assert.ok(!decide(79, 0, width));
        assert.ok(decide(80, 0, width), 'phone and tablet use the same threshold');
        assert.ok(decide(-80, 0, width));
    }
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
    assert.equal(h.swipe.offset, -72);
    assert.equal(h.stage.style.transform, 'translate3d(-72px,0,0)');
    assert.equal(h.reads(), 0, 'dragging never forces a geometry read');
    h.swipe.end({ type: 'touchcancel' });
    assert.equal(h.timers.size, 1);
    h.swipe.reset();
    assert.equal(h.timers.size, 0);
    assert.equal(h.frames.size, 0);
    assert.equal(h.swipe.offset, 0);
    assert.equal(h.stage.style.transform, '');
});

test('drag visuals start after 24px and a long hold never advances the page before release', () => {
    const h = fixture();
    h.swipe.start(h.event(300));
    h.swipe.move(h.event(280)); h.flush();
    assert.equal(h.swipe.offset, 0);
    assert.equal(h.stage.style.opacity, '1');
    h.swipe.move(h.event(276)); h.flush();
    assert.equal(h.swipe.offset, 0);
    h.swipe.move(h.event(270)); h.flush();
    assert.equal(h.swipe.offset, -6, 'the threshold is subtracted to avoid a jump');
    for (let i = 0; i < 20; i++) { h.swipe.move(h.event(-1000 - i * 100)); h.flush(); }
    assert.equal(h.swipe.offset, -400);
    assert.equal(h.reader.currentIndex, 2);
    assert.equal(h.reader.displayedIndex, 2);
});

test('disabled transitions keep the current image still and complete without timers or layout reads', () => {
    for (const mode of ['parallel', 'fade', 'smooth']) {
        const h = fixture();
        h.reader.animationMode = mode;
        h.reader.transitionEnabled = false;
        const neighbor = { style: {} };
        h.swipe.slots.set(1, { stage: neighbor });
        h.swipe.start(h.event(300));
        h.swipe.move(h.event(210));
        assert.equal(h.frames.size, 0, 'disabled effects do not schedule visual updates');
        assert.equal(h.swipe.offset, -66, 'visual distance excludes the initial dead zone');
        assert.equal(h.stage.style.transform, 'none');
        assert.equal(h.stage.style.opacity, '1');
        assert.equal(neighbor.style.visibility, 'hidden');
        let completed = false;
        h.swipe.animateTo(-h.swipe.travelDistance, 0, () => { completed = true; });
        assert.equal(completed, true);
        assert.equal(h.timers.size, 0);
        assert.equal(h.frames.size, 0);
        assert.equal(h.reads(), 0);
    }
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
    assert.equal(h.swipe.offset, 6, 'only edge overflow after the 24px dead zone moves the page');
});

test('disabled previews prepare images without DOM and hand the cached group to normal animated rendering', async () => {
    const h = fixture();
    const image = { parentElement: {}, cloneNode() { throw new Error('unneeded clone'); } };
    let protectedGroup = false, committed;
    Object.assign(h.reader, { transitionEnabled: false, isOpen: true, activePageCount: 1,
        imgList: ['a', 'b', 'c', 'd'], getNextPageGroupIndex: () => 3,
        getImageDisplayLayout() { throw new Error('unneeded preview layout'); },
        imageLoader: { protectImages() { protectedGroup = true; return () => { protectedGroup = false; }; } },
        render(animate, step, result) {
            assert.equal(animate, true);
            assert.equal(step, 1);
            committed = result.images;
            h.swipe.reset();
        } });
    h.context.BilibiliToolbox.readerPageGroups = { async loadVisibleImages() {
        return { images: [image], preloadStart: 4 };
    } };
    delete h.swipe.prepare;
    delete h.reader.el.pageStage;
    h.swipe.start(h.event(300));
    const slot = await h.swipe.prepare(1);
    assert.ok(slot, 'image preparation works with no document available');
    assert.equal(slot.stage, null);
    assert.equal(slot.result.images[0], image);
    assert.equal(h.reader.el.pageStage, undefined, 'no outer stage is created either');
    assert.equal(protectedGroup, true);
    await h.swipe.commit(slot);
    assert.equal(committed[0], image);
    assert.equal(h.reader.currentIndex, 3);
    assert.equal(protectedGroup, false);
    assert.equal(h.swipe.slots.size, 0);
});

test('already settled and reduced-motion turns finish without a layout read or timer', () => {
    for (const reduced of [false, true]) {
        const h = fixture();
        h.context.matchMedia = () => ({ matches: reduced });
        h.swipe.width = 400;
        let completed = 0;
        h.swipe.animateTo(reduced ? -400 : 0, 0, () => completed++);
        assert.equal(completed, 1);
        assert.equal(h.reads(), 0);
        assert.equal(h.timers.size, 0);
        assert.equal(h.frames.size, 0);
    }
});

test('a new touch cancels a direct duplicate-page commit while its clone is decoding', async () => {
    const h = fixture();
    let finishDecode;
    const decoded = new Promise(resolve => { finishDecode = resolve; });
    const image = { cloneNode: () => ({ decode: () => decoded }) };
    h.reader.isOpen = true;
    h.reader.transitionEnabled = false;
    h.reader.commitImages = () => assert.fail('interrupted commit must not replace the visible page');
    const commit = h.swipe.commit({ stage: null, result: { images: [image, image], index: 3 } });
    h.swipe.start(h.event(300));
    finishDecode();
    await commit;
    assert.equal(h.reader.currentIndex, 2);
    assert.ok(h.swipe.gesture);
});

test('neighbor preparation is shared across touches and stale completion cannot release new protection', async () => {
    const h = fixture();
    const active = new Set(), pending = [];
    let protections = 0;
    Object.assign(h.reader, { isTouchDevice: true, isOpen: true, activePageCount: 1,
        imgList: ['a', 'b', 'c', 'd', 'e'], pruneImageCache() {},
        imageLoader: { protectImages() {
            const id = ++protections; active.add(id);
            return () => active.delete(id);
        } } });
    delete h.swipe.schedule;
    h.swipe.prepare = direction => {
        h.swipe.slots.set(direction, { stage: { querySelectorAll: () => [], remove() {} }, release() {} });
        return new Promise(resolve => pending.push({ direction, resolve }));
    };
    const startTimer = () => {
        assert.equal(h.timers.size, 1);
        const [id, run] = [...h.timers][0]; h.timers.delete(id); run();
    };
    const tick = () => new Promise(resolve => setImmediate(resolve));
    h.swipe.schedule(); h.swipe.schedule(0);
    assert.equal(protections, 1, 'rescheduling reuses the warm cache protection');
    startTimer();
    h.swipe.schedule(0); h.swipe.schedule(0);
    assert.equal(h.timers.size, 0, 'repeated touches join the running preparation');
    assert.deepEqual(pending.map(task => task.direction), [1]);
    pending.shift().resolve(); await tick();
    assert.deepEqual(pending.map(task => task.direction), [-1], 'neighbors still decode in sequence');
    const stale = pending.shift();
    h.swipe.reset();
    assert.equal(active.size, 0);
    h.swipe.schedule(0); startTimer();
    stale.resolve(); await tick();
    assert.equal(active.size, 1, 'old task cannot release the next page group protection');
    pending.shift().resolve(); await tick();
    pending.shift().resolve(); await tick();
    assert.equal(active.size, 0);
    h.swipe.schedule(0);
    assert.equal(h.timers.size, 0, 'ready neighbors need no new preparation task');
    assert.equal(protections, 2);
});

test('fade and smooth pass through the background without overlapping the page images', () => {
    for (const mode of ['parallel', 'fade', 'smooth']) {
        const h = fixture();
        h.reader.animationMode = mode;
        h.swipe.width = 400;
        const incoming = { style: {} };
        h.swipe.slots.set(1, { stage: incoming });
        h.swipe.gesture = { axis: 'x' };
        h.swipe.write(-60);
        assert.equal(incoming.style.visibility, 'visible');
        if (mode === 'parallel') {
            assert.equal(h.stage.style.opacity, '1');
            assert.equal(h.stage.style.transform, 'translate3d(-60px,0,0)');
        } else {
            assert.equal(h.stage.style.opacity, '0.5');
            assert.equal(incoming.style.opacity, '0');
            if (mode === 'fade') assert.equal(h.stage.style.transform, 'translate3d(0px,0,0)');
            else assert.equal(h.stage.style.transform, 'translate3d(-24px,0,0) scale(0.975)');
            h.swipe.write(-120);
            assert.equal(h.stage.style.opacity, '0');
            assert.equal(incoming.style.opacity, '0', 'midpoint displays the background color');
            h.swipe.write(-180);
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
    h.swipe.animateTo(-240, 0, () => completed++);
    assert.equal(h.swipe.offset, -120);
    assert.equal(h.stage.style.opacity, '0');
    assert.equal(incoming.style.opacity, '0');
    const [id, callback] = [...h.timers][0];
    h.timers.delete(id); callback();
    h.flush();
    assert.equal(h.swipe.offset, -120, 'one display frame holds the selected background');
    assert.equal(completed, 0);
    assert.equal(h.frames.size, 1);
    h.swipe.stopMotion();
    assert.equal(h.frames.size, 0, 'interruption cancels the pending fade-in');
    assert.equal(h.timers.size, 0);
    h.flush();
    assert.equal(completed, 0);
});

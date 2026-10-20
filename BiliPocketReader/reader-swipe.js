// Direct-manipulation page turns. Image zoom stays on the inner container;
// only these viewport-sized stages move during a swipe.
(function() {
    'use strict';
    const Toolbox = window.BilibiliToolbox;
    const AXIS_SLOP = 10;
    const FLICK_SPEED = 0.5; // CSS pixels per millisecond
    const now = () => performance.now();
    const animationMode = reader => Toolbox.animations.normalizeAnimationMode(reader.animationMode);
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    function releaseDecision(offset, velocity, width) {
        const sign = Math.sign(offset);
        const reversing = Math.abs(velocity) >= FLICK_SPEED && Math.sign(velocity) !== sign;
        return sign && !reversing && (Math.abs(offset) >= width * 0.25
            || (Math.abs(offset) >= 20 && Math.abs(velocity) >= FLICK_SPEED));
    }

    class ReaderSwipe {
        constructor(reader) {
            this.reader = reader;
            this.epoch = 0;
            this.motion = 0;
            this.slots = new Map();
            this.offset = 0;
            this.frame = null;
            this.timer = null;
            this.prepareTimer = null;
            this.gesture = null;
            this.pendingOffset = undefined;
        }

        ensureStage() {
            const r = this.reader;
            if (!r.el.pageStage) {
                const stage = document.createElement('div');
                stage.className = 'comic-page-stage comic-page-current';
                r.el.imgContainer.before(stage);
                stage.appendChild(r.el.imgContainer);
                r.el.pageStage = stage;
            }
            return r.el.pageStage;
        }

        setStageStyle(property, value) {
            if (this.reader.el.pageStage) this.reader.el.pageStage.style[property] = value;
            for (const { stage } of this.slots.values()) stage.style[property] = value;
        }

        cancelMotion() {
            ++this.motion;
            clearTimeout(this.timer);
            if (this.frame !== null) cancelAnimationFrame(this.frame);
            this.frame = this.timer = null;
            this.animating = this.waiting = false;
        }

        reset(suppressTouch = true) {
            if (this.gesture && suppressTouch) this.reader.suppressRemainingTouch = true;
            ++this.epoch;
            this.cancelMotion();
            clearTimeout(this.prepareTimer);
            this.prepareTimer = null;
            this.gesture = null;
            this.pendingOffset = undefined;
            this.offset = 0;
            this.visualSign = 0;
            this.programmatic = false;
            if (this.reader.el.pageStage) Object.assign(this.reader.el.pageStage.style,
                { transform: '', opacity: '', transition: '', willChange: '' });
            for (const slot of this.slots.values()) {
                slot.stage.querySelectorAll('img').forEach(img => img.remove());
                slot.stage.remove();
                slot.release();
            }
            this.slots.clear();
            this.warmProtection?.();
            this.warmProtection = null;
        }

        schedule(delay = 120) {
            const r = this.reader;
            if (!r.isTouchDevice || !r.isOpen || !r.el.imgContainer?.firstChild) return;
            clearTimeout(this.prepareTimer);
            this.warmProtection?.();
            // Protect predecessors before the existing memory-policy microtask.
            const releaseWarm = r.imageLoader.protectImages(
                r.imgList.slice(Math.max(0, r.currentIndex - 2), r.currentIndex + r.activePageCount + 2));
            this.warmProtection = releaseWarm;
            const epoch = this.epoch;
            this.prepareTimer = setTimeout(() => {
                this.prepareTimer = null;
                if (epoch !== this.epoch || !r.isOpen) return;
                this.ensureStage();
                // Decode the next group first, then the predecessor, yielding to
                // foreground rendering rather than decoding four originals at once.
                this.prepare(1).then(() => {
                    if (epoch === this.epoch) return this.prepare(-1);
                }).finally(() => {
                    if (epoch !== this.epoch) return;
                    releaseWarm();
                    if (this.warmProtection === releaseWarm) this.warmProtection = null;
                    r.pruneImageCache();
                });
            }, delay);
        }

        prepare(direction) {
            const r = this.reader;
            if (!r.isOpen || !r.canTurnPage(direction)) return Promise.resolve(null);
            const cached = this.slots.get(direction);
            if (cached) return cached.promise;
            const epoch = this.epoch;
            const index = r.currentIndex;
            const start = direction < 0 ? Math.max(0, index - 2) : index + r.activePageCount;
            const slot = this.createSlot(direction, r.imgList.slice(start, direction < 0 ? index : start + 2));
            const { hint } = slot;
            slot.promise = (async () => {
                const target = direction < 0 ? await r.getPreviousPageGroupIndex()
                    : r.getNextPageGroupIndex(r.activePageCount);
                if (epoch !== this.epoch) return null;
                const result = await Toolbox.readerPageGroups.loadVisibleImages({
                    currentIndex: target, imgList: r.imgList, viewMode: r.viewMode,
                    loadImage: src => epoch === this.epoch ? r.loadImage(src) : Promise.resolve(null),
                    isWideImage: img => r.isWideImage(img)
                });
                if (epoch !== this.epoch || !result) return null;
                return this.fillSlot(slot, result, target, epoch);
            })().catch(() => null).then(ready => {
                if (!ready && epoch === this.epoch) hint.textContent = '图片加载失败';
                return ready;
            });
            return slot.promise;
        }

        createSlot(direction, sources) {
            const r = this.reader;
            const stage = document.createElement('div');
            stage.className = 'comic-page-stage comic-page-neighbor';
            stage.setAttribute('aria-hidden', 'true');
            const hint = document.createElement('span');
            hint.className = 'comic-page-loading';
            hint.textContent = '图片加载中…';
            stage.appendChild(hint);
            this.ensureStage().before(stage);
            const slot = { stage, hint, result: null,
                release: r.imageLoader.protectImages(sources) };
            this.slots.set(direction, slot);
            this.write(this.offset);
            return slot;
        }

        async fillSlot(slot, result, target, epoch) {
            const r = this.reader;
            // Repeated URLs must never move a currently visible node away.
            const used = new Set(), clones = [];
            result.images = result.images.map(img => {
                const duplicate = img.parentElement || used.has(img);
                used.add(img);
                if (!duplicate) return img;
                const clone = img.cloneNode(false);
                clones.push(clone);
                return clone;
            });
            await Promise.all(clones.map(img => img.decode().catch(() => {})));
            if (epoch !== this.epoch) return null;
            const content = document.createElement('div');
            content.className = 'comic-swipe-images';
            content.style.flexDirection = r.isRightToLeft ? 'row-reverse' : 'row';
            const { sizes } = r.getImageDisplayLayout(result.images, result.images.length === 1);
            result.images.forEach((img, i) => r.setupImg(img, result.images.length === 1,
                sizes[i]));
            content.append(...result.images);
            slot.stage.replaceChildren(content);
            slot.result = { ...result, index: target };
            return slot;
        }

        async play(result, index, step, token) {
            const r = this.reader;
            const epoch = this.epoch;
            this.programmatic = true;
            this.width = r.viewportRect?.width || r.el.reader.clientWidth;
            const direction = Math.sign(step || index - r.displayedIndex) || 1;
            const slot = this.createSlot(direction, result.images.map(img => img.src));
            slot.promise = this.fillSlot(slot, result, index, epoch);
            await slot.promise;
            if (epoch !== this.epoch || token !== r.pageFlipToken || !r.isOpen) return;
            const side = direction * (r.isRightToLeft ? 1 : -1);
            this.animateTo(side * this.width, 0, () => this.commit(slot, false));
        }

        commit(slot, advanceToken = true) {
            const r = this.reader;
            const result = slot.result;
            r.currentIndex = result.index;
            if (advanceToken) ++r.pageFlipToken;
            // Detach the preview before committing; commitImages schedules its
            // replacement once, with the new cache protections in place.
            this.reset();
            r.commitImages(result.images, 'immediate', 0, result.preloadStart);
            r.displayedIndex = result.index;
            r.syncThumbnailSelection();
        }

        direction(offset) {
            return (offset > 0) !== this.reader.isRightToLeft ? -1 : 1;
        }

        write(offset) {
            this.offset = offset;
            const stage = this.reader.el.pageStage;
            if (!stage) return;
            const width = this.width || this.reader.viewportRect?.width || this.reader.el.reader.clientWidth;
            const mode = animationMode(this.reader);
            if (offset) this.visualSign = Math.sign(offset);
            const sign = this.visualSign || 0;
            const selected = this.direction(sign);
            // At article boundaries every style uses the same resistant nudge.
            const blend = mode !== 'parallel' && this.slots.has(selected);
            const progress = Math.min(1, Math.abs(offset) / Math.max(1, width));
            // The two opacity ranges never overlap: halfway through the turn,
            // both stages are transparent and the selected reader background shows.
            const outgoing = Math.min(1, progress * 2);
            const incoming = Math.max(0, progress * 2 - 1);
            const shift = Math.min(60, width * 0.12);
            const active = this.gesture?.axis === 'x' || this.animating || this.waiting;
            stage.style.opacity = String(blend ? 1 - outgoing : 1);
            stage.style.transform = !blend ? `translate3d(${offset}px,0,0)`
                : mode === 'smooth' ? `translate3d(${sign * shift * outgoing}px,0,0) scale(${1 - 0.05 * outgoing})`
                : 'translate3d(0px,0,0)';
            for (const [direction, slot] of this.slots) {
                slot.stage.style.visibility = active && (!blend || (direction === selected && (progress > 0 || this.animating))) ? 'visible' : 'hidden';
                if (blend && direction !== selected) continue;
                const side = direction * (this.reader.isRightToLeft ? -1 : 1);
                slot.stage.style.opacity = String(blend ? incoming : 1);
                slot.stage.style.transform = !blend ? `translate3d(${offset + side * width}px,0,0)`
                    : mode === 'smooth' ? `translate3d(${-sign * shift * (1 - incoming)}px,0,0) scale(${0.95 + 0.05 * incoming})`
                    : 'translate3d(0px,0,0)';
            }
        }

        stopMotion(freeze = false) {
            if (freeze && this.animating) {
                const styles = getComputedStyle(this.reader.el.pageStage);
                if (animationMode(this.reader) === 'parallel' || !this.slots.has(this.direction(this.visualSign || this.offset))) {
                    this.offset = styles.transform === 'none' ? 0 : new DOMMatrixReadOnly(styles.transform).m41;
                } else {
                    const opacity = Number(styles.opacity);
                    const slot = this.slots.get(this.direction(this.visualSign));
                    const progress = opacity > 0 ? (1 - opacity) / 2
                        : (1 + Number(getComputedStyle(slot.stage).opacity)) / 2;
                    this.offset = this.visualSign * this.width * progress;
                }
            }
            this.cancelMotion();
            this.setStageStyle('transition', 'none');
            this.write(this.offset);
        }

        start(e) {
            const r = this.reader;
            if (this.programmatic) {
                r.currentIndex = r.displayedIndex;
                ++r.pageFlipToken;
                this.programmatic = false;
            }
            if (!r.el.imgContainer?.firstChild || r.currentIndex !== r.displayedIndex) return;
            this.ensureStage();
            this.stopMotion(true);
            this.pendingOffset = this.offset;
            this.width = r.viewportRect?.width || r.el.reader.clientWidth;
            const touch = e.touches[0];
            this.gesture = { x: touch.clientX, y: touch.clientY, origin: this.offset,
                axis: Math.abs(this.offset) > 1 ? 'x' : null,
                samples: [{ x: touch.clientX, time: now() }] };
            this.schedule(0);
        }

        move(e) {
            const g = this.gesture;
            if (!g) return false;
            const r = this.reader;
            const touch = e.touches[0];
            let dx = touch.clientX - g.x;
            const dy = touch.clientY - g.y;
            if (!g.axis) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_SLOP) return true;
                if (Math.abs(dy) > Math.abs(dx) * 1.2) g.axis = 'y';
                else if (Math.abs(dx) > Math.abs(dy) * 1.2) {
                    if (r.scale > 1.01) {
                        const scale = r.getRenderScale();
                        const limits = r.getPanLimits();
                        const nextX = r.initX + dx / scale;
                        const clampedX = r.clampPanValue(nextX, limits.maxX);
                        const excess = (nextX - clampedX) * scale;
                        if (Math.abs(excess) < AXIS_SLOP) return false;
                        r.translateX = clampedX;
                        r.translateY = r.clampPanValue(r.initY + dy / scale, limits.maxY);
                        r.applyTransform();
                        g.x = touch.clientX - (excess - Math.sign(excess) * AXIS_SLOP);
                        dx = touch.clientX - g.x;
                    }
                    g.axis = 'x';
                    r.clearPendingTap();
                    r.cancelPreload();
                    r.setTransformTransition('none');
                    this.setStageStyle('willChange', 'transform, opacity');
                } else return true;
            }
            if (g.axis === 'y') return r.scale <= 1.01;
            e.preventDefault();
            const raw = g.origin + dx;
            if (r.canTurnPage(this.direction(raw))) this.prepare(this.direction(raw));
            const offset = r.canTurnPage(this.direction(raw)) ? clamp(raw, -this.width, this.width)
                : Math.sign(raw) * 72 * (1 - Math.exp(-Math.abs(raw) / 180));
            const time = now();
            g.samples.push({ x: touch.clientX, time });
            g.samples = g.samples.filter(sample => time - sample.time <= 100);
            this.pendingOffset = offset;
            if (this.frame === null) this.frame = requestAnimationFrame(() => {
                this.frame = null;
                this.write(this.pendingOffset);
            });
            return true;
        }

        animateTo(target, velocity, done) {
            this.stopMotion();
            const motion = this.motion;
            const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
            const distance = Math.abs(target - this.offset);
            const mode = animationMode(this.reader);
            const gentle = mode !== 'parallel' && this.slots.has(this.direction(this.visualSign));
            const speed = gentle ? Math.max(1, Math.abs(velocity) * 0.6) : Math.max(1.6, Math.abs(velocity));
            const duration = reduced ? 0 : clamp(distance / speed, gentle ? 280 : 120, gentle ? 420 : 220);
            this.animating = true;
            const finish = () => { this.animating = false; done(); };
            const phase = (offset, milliseconds, complete) => {
                if (motion !== this.motion) return;
                this.reader.el.pageStage.getBoundingClientRect();
                this.setStageStyle('transition', `transform ${milliseconds}ms cubic-bezier(.2,.7,.25,1), opacity ${milliseconds}ms cubic-bezier(.2,.7,.25,1)`);
                this.write(offset);
                this.timer = setTimeout(() => {
                    if (motion !== this.motion) return;
                    this.timer = null;
                    complete();
                }, milliseconds);
            };
            const middle = this.visualSign * this.width / 2;
            const crossesBackground = gentle
                && (this.offset - middle) * (target - middle) < 0;
            if (duration && crossesBackground) {
                const firstShare = duration * Math.abs(middle - this.offset) / distance;
                // Keep both phases perceptible even when release is close to
                // the background midpoint; a flick must not compress either one.
                const firstDuration = clamp(firstShare, 160, 220);
                const secondDuration = clamp(duration - firstShare, 220, 280);
                phase(middle, firstDuration, () => {
                    // Paint the fully transparent midpoint before starting the
                    // next phase. Cancel/reset can still stop either frame.
                    this.frame = requestAnimationFrame(() => {
                        this.frame = requestAnimationFrame(() => {
                            this.frame = null;
                            phase(target, secondDuration, finish);
                        });
                    });
                });
            } else phase(target, duration, finish);
        }

        end(e) {
            const g = this.gesture;
            if (!g) return false;
            if (e.type === 'touchcancel') {
                this.gesture = null;
                this.animateTo(0, 0, () => this.rest());
                return true;
            }
            if (g.axis !== 'x') {
                this.gesture = null;
                return g.axis === 'y' && this.reader.scale <= 1.01;
            }
            const finalTouch = e.changedTouches?.[0];
            if (finalTouch && finalTouch.clientX !== g.samples[g.samples.length - 1]?.x) {
                this.move({ touches: [finalTouch], preventDefault() {} });
            }
            e.preventDefault();
            if (this.frame !== null) cancelAnimationFrame(this.frame);
            this.frame = null;
            if (this.pendingOffset !== undefined) this.write(this.pendingOffset);
            const samples = g.samples.filter(sample => now() - sample.time <= 100);
            const first = samples[0], last = samples[samples.length - 1];
            const velocity = samples.length > 1 && last.time > first.time ? (last.x - first.x) / (last.time - first.time) : 0;
            const direction = this.direction(this.offset);
            const commit = this.reader.canTurnPage(direction) && releaseDecision(this.offset, velocity, this.width);
            this.gesture = null;
            this.reader.clearPendingTap();
            if (!commit) {
                this.animateTo(0, velocity, () => this.rest());
                return true;
            }
            const epoch = this.epoch;
            const settle = ready => {
                if (epoch !== this.epoch) return;
                if (!ready) {
                    this.reader.showReaderMessage('图片加载失败，请重试', true);
                    this.animateTo(0, 0, () => { this.reset(); this.schedule(); });
                    return;
                }
                this.animateTo(Math.sign(this.offset) * this.width, velocity, () => {
                    this.commit(ready);
                });
            };
            const slot = this.slots.get(direction);
            if (slot?.result) settle(slot);
            else {
                this.waiting = true;
                this.write(this.offset);
                const motion = this.motion;
                this.prepare(direction).then(ready => {
                    if (motion === this.motion && !this.gesture) settle(ready);
                });
            }
            return true;
        }

        rest() {
            this.stopMotion();
            this.write(0);
            this.setStageStyle('willChange', '');
            this.reader.preloadImages(this.reader.currentIndex + this.reader.activePageCount);
        }
    }

    Toolbox.ReaderSwipe = ReaderSwipe;
    Toolbox.swipeReleaseDecision = releaseDecision;
})();

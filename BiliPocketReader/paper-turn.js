// Curved paper mesh, rendered from the already decoded reader images.
(function() {
    'use strict';

    const DURATION = 720;
    const SEGMENTS = 44;
    const CANVAS_PIXEL_BUDGET = 40e6;
    const lerp = (a, b, t) => a + (b - a) * t;

    // Integrate a changing tangent along the sheet: the paper bends, rather
    // than rotating as a rigid rectangle. Projection gives each strip depth.
    function createMesh(progress, from, to, outward, segments = SEGMENTS) {
        const t = Math.max(0, Math.min(1, progress));
        const width = lerp(from.width, to.width, t);
        const height = lerp(from.height, to.height, t);
        const hinge = lerp(from.hinge, to.hinge, t);
        const centerY = lerp(from.centerY, to.centerY, t);
        const camera = Math.max(width * 3.5, 1600);
        // A deeper bow lets the middle of the leaf lag behind the spine.
        // Keep its tangent above the page plane during the initial lift.
        const curl = Math.min(Math.sin(Math.PI * t) * 1.8, Math.PI * t * 0.98);
        let x = 0;
        let z = 0;
        const points = [];
        for (let i = 0; i <= segments; i += 1) {
            const u = i / segments;
            const angle = Math.PI * t - curl * Math.sin(Math.PI * u);
            if (i) {
                const midpoint = Math.PI * t - curl * Math.sin(Math.PI * (u - 0.5 / segments));
                x += Math.cos(midpoint) * width / segments;
                z += Math.sin(midpoint) * width / segments;
            }
            const perspective = camera / (camera - z);
            points.push({
                u, angle, z,
                x: hinge + outward * x * perspective,
                top: centerY - height * perspective / 2,
                bottom: centerY + height * perspective / 2
            });
        }
        return points;
    }

    function makeCanvas(width, height, ratio = 1, resources) {
        const canvas = document.createElement('canvas');
        resources?.add(canvas);
        canvas.width = Math.max(1, Math.floor(width * ratio));
        canvas.height = Math.max(1, Math.floor(height * ratio));
        return canvas;
    }

    // Preserve screen pixels on high-DPI displays while bounding canvas memory.
    function rasterRatio(width, height, preferred, pixelBudget) {
        return Math.min(preferred, Math.sqrt(pixelBudget / (width * height)), 8192 / Math.max(width, height));
    }

    function imageContext(canvas, width, height) {
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.scale(canvas.width / width, canvas.height / height);
        return context;
    }

    function drawOriginal(context, { image, box, rotation, filter }) {
        context.save();
        context.filter = filter;
        context.translate(box.x + box.width / 2, box.y + box.height / 2);
        context.rotate(rotation * Math.PI / 180);
        const sideways = rotation === 90 || rotation === 270;
        const width = sideways ? box.height : box.width;
        const height = sideways ? box.width : box.height;
        context.drawImage(image, -width / 2, -height / 2, width, height);
        context.restore();
    }

    function capture(container, rotation, bounds) {
        const background = window.getComputedStyle(container.parentElement).backgroundColor;
        const rects = [];
        const originals = [];
        for (const image of container.querySelectorAll('img')) {
            const rect = image.getBoundingClientRect();
            if (!rect.width || !rect.height) continue;
            const box = { x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height };
            rects.push(box);
            const original = { image, box, rotation, filter: window.getComputedStyle(image).filter };
            originals.push(original);
        }
        return { originals, background, rects: rects.sort((a, b) => a.x - b.x) };
    }

    function visibleBounds(rects, bounds) {
        const x = Math.max(0, Math.min(...rects.map(rect => rect.x)));
        const y = Math.max(0, Math.min(...rects.map(rect => rect.y)));
        const right = Math.min(bounds.width, Math.max(...rects.map(rect => rect.x + rect.width)));
        const bottom = Math.min(bounds.height, Math.max(...rects.map(rect => rect.y + rect.height)));
        return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
    }

    function makeFace(snapshot, rect, dimensions, flip, resources) {
        // Perspective enlarges lifted paper. Build its texture directly from
        // decoded originals, with headroom, rather than resizing the snapshot.
        const face = makeCanvas(dimensions.width, dimensions.height, 1, resources);
        const context = imageContext(face, rect.width, rect.height);
        context.fillStyle = snapshot.background;
        context.fillRect(0, 0, rect.width, rect.height);
        if (flip) {
            context.translate(rect.width, 0);
            context.scale(-1, 1);
        }
        context.translate(-rect.x, -rect.y);
        for (const original of snapshot.originals) {
            const box = original.box;
            if (box.x < rect.x + rect.width && box.x + box.width > rect.x
                && box.y < rect.y + rect.height && box.y + box.height > rect.y) {
                drawOriginal(context, original);
            }
        }
        return face;
    }

    // An affine texture triangle avoids CSS seams and works with cross-origin
    // images: the canvas is never read back or exported.
    function drawTriangle(context, image, source, target) {
        const [s0, s1, s2] = source;
        const [p0, p1, p2] = target;
        const determinant = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
        if (!determinant) return;
        const a = ((p1.x - p0.x) * (s2.y - s0.y) - (p2.x - p0.x) * (s1.y - s0.y)) / determinant;
        const b = ((p1.y - p0.y) * (s2.y - s0.y) - (p2.y - p0.y) * (s1.y - s0.y)) / determinant;
        const c = ((p2.x - p0.x) * (s1.x - s0.x) - (p1.x - p0.x) * (s2.x - s0.x)) / determinant;
        const d = ((p2.y - p0.y) * (s1.x - s0.x) - (p1.y - p0.y) * (s2.x - s0.x)) / determinant;
        context.save();
        context.beginPath();
        // Subpixel overlap hides antialiasing cracks between adjacent triangles.
        const winding = Math.sign((p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y));
        target.forEach((point, index) => {
            const previous = target[(index + 2) % 3], next = target[(index + 1) % 3];
            const normal = (a, b) => {
                const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
                return { x: (b.y - a.y) / length * winding, y: (a.x - b.x) / length * winding };
            };
            const left = normal(previous, point), right = normal(point, next);
            const offset = 0.65 / Math.max(0.00001, 1 + left.x * right.x + left.y * right.y);
            context[index ? 'lineTo' : 'moveTo'](point.x + (left.x + right.x) * offset, point.y + (left.y + right.y) * offset);
        });
        context.closePath();
        context.clip();
        context.transform(a, b, c, d, p0.x - a * s0.x - c * s0.y, p0.y - b * s0.x - d * s0.y);
        context.drawImage(image, 0, 0);
        context.restore();
    }

    function shadeFace(target, source, mesh, isBack) {
        const context = target.getContext('2d');
        context.drawImage(source, 0, 0);
        const light = context.createLinearGradient(0, 0, target.width, 0);
        mesh.forEach(point => {
            const shade = Math.pow(Math.abs(Math.sin(point.angle)), 3) * 0.28;
            light.addColorStop(point.u, isBack ? `rgba(106,86,54,${0.025 + shade})` : `rgba(0,0,0,${shade})`);
        });
        context.fillStyle = light;
        context.fillRect(0, 0, target.width, target.height);
    }

    function drawSheet(context, mesh, front, back, scratch) {
        let shadedSide = null;
        const strips = mesh.slice(0, -1).map((point, index) => ({ a: point, b: mesh[index + 1] }));
        // Far surfaces first, so the curled edge correctly occludes the sheet.
        strips.sort((left, right) => left.a.z + left.b.z - right.a.z - right.b.z);
        for (const { a, b } of strips) {
            const angle = (a.angle + b.angle) / 2;
            const isBack = Math.cos(angle) < 0;
            if (shadedSide !== isBack) {
                shadeFace(scratch, isBack ? back : front, mesh, isBack);
                shadedSide = isBack;
            }
            const face = scratch;
            const source = [
                { x: a.u * face.width, y: 0 }, { x: b.u * face.width, y: 0 },
                { x: b.u * face.width, y: face.height }, { x: a.u * face.width, y: face.height }
            ];
            const target = [
                { x: a.x, y: a.top }, { x: b.x, y: b.top },
                { x: b.x, y: b.bottom }, { x: a.x, y: a.bottom }
            ];
            drawTriangle(context, face, [source[0], source[1], source[2]], [target[0], target[1], target[2]]);
            drawTriangle(context, face, [source[0], source[2], source[3]], [target[0], target[2], target[3]]);
        }
        context.beginPath();
        mesh.forEach((point, index) => context[index ? 'lineTo' : 'moveTo'](point.x, point.bottom));
        context.strokeStyle = 'rgba(255, 248, 225, .65)';
        context.lineWidth = 0.8;
        context.stroke();
    }

    function play({ container, direction, rotation, commit, isCurrent, onFinish }) {
        const reader = container.parentElement;
        const bounds = reader.getBoundingClientRect();
        if (!bounds.width || !bounds.height) { commit(); return null; }
        const ratio = rasterRatio(bounds.width, bounds.height, window.devicePixelRatio || 1, 12e6);
        let before, after;
        let committed = false;
        let overlay;
        let frame = 0;
        const resources = new Set();
        let disposed = false;
        const dispose = () => {
            if (disposed) return;
            disposed = true;
            window.cancelAnimationFrame(frame);
            overlay?.remove();
            // Explicitly drop backing stores, including canvases allocated
            // before an error. Removing a DOM node alone does not free pixels.
            for (const canvas of resources) canvas.width = canvas.height = 0;
            resources.clear();
            before = after = null;
            container.style.visibility = '';
        };
        try {
            before = capture(container, rotation, bounds);
            commit();
            committed = true;
            after = capture(container, rotation, bounds, ratio, resources);
            if (!before.rects.length || !after.rects.length) { dispose(); return null; }
            const withinViewport = rect => rect.x >= -1 && rect.x + rect.width <= bounds.width + 1;
            const spread = before.rects.length === 2 && after.rects.length === 2
                && before.rects.every(withinViewport) && after.rects.every(withinViewport);
            const outward = direction > 0 ? -1 : 1;
            const frontRect = spread ? before.rects[outward > 0 ? 1 : 0] : visibleBounds(before.rects, bounds);
            const backRect = spread ? after.rects[outward > 0 ? 0 : 1] : frontRect;
            const from = {
                width: frontRect.width, height: frontRect.height,
                hinge: frontRect.x + (outward < 0 ? frontRect.width : 0),
                centerY: frontRect.y + frontRect.height / 2
            };
            const to = spread ? {
                width: backRect.width, height: backRect.height,
                hinge: backRect.x + (outward > 0 ? backRect.width : 0),
                centerY: backRect.y + backRect.height / 2
            } : from;
            overlay = makeCanvas(bounds.width, bounds.height, ratio, resources);
            // Keep the committed DOM visible beneath the transparent overlay.
            // Only the stationary half of the previous spread needs a backing store.
            const stationaryRect = {
                x: outward > 0 ? 0 : Math.min(from.hinge, to.hinge), y: 0,
                width: outward > 0 ? Math.max(from.hinge, to.hinge) : bounds.width - Math.min(from.hinge, to.hinge),
                height: bounds.height
            };
            const stationary = spread ? makeFace(before, stationaryRect, {
                width: Math.max(1, Math.floor(stationaryRect.width * ratio)),
                height: Math.max(1, Math.floor(stationaryRect.height * ratio))
            }, false, resources) : null;
            const usedPixels = overlay.width * overlay.height + (stationary ? stationary.width * stationary.height : 0);
            const width = Math.max(frontRect.width, backRect.width);
            const height = Math.max(frontRect.height, backRect.height);
            const faceRatio = rasterRatio(width, height, ratio * 1.5,
                Math.min(8e6, (CANVAS_PIXEL_BUDGET - usedPixels) / 3));
            const dimensions = { width: Math.max(1, Math.floor(width * faceRatio)), height: Math.max(1, Math.floor(height * faceRatio)) };
            const front = makeFace(before, frontRect, dimensions, outward < 0, resources);
            const back = makeFace(spread ? after : before, backRect, dimensions, outward > 0, resources);
            const scratch = makeCanvas(dimensions.width, dimensions.height, 1, resources);
            before.originals = after.originals = [];
            overlay.className = 'comic-paper-turn';
            overlay.setAttribute('aria-hidden', 'true');
            const context = imageContext(overlay, bounds.width, bounds.height);
            const draw = progress => {
                const t = progress * progress * (3 - 2 * progress);
                context.clearRect(0, 0, bounds.width, bounds.height);
                if (stationary) {
                    context.save();
                    const hinge = lerp(from.hinge, to.hinge, t);
                    context.beginPath();
                    context.rect(outward > 0 ? 0 : hinge, 0, outward > 0 ? hinge : bounds.width - hinge, bounds.height);
                    context.clip();
                    context.globalAlpha = Math.min(1, (1 - t) / 0.04);
                    context.drawImage(stationary, stationaryRect.x, 0, stationaryRect.width, bounds.height);
                    context.restore();
                }
                context.save();
                if (!spread) {
                    const visible = visibleBounds([...before.rects, ...after.rects], bounds);
                    context.beginPath();
                    context.rect(visible.x, 0, visible.width, bounds.height);
                    context.clip();
                }
                const mesh = createMesh(t, from, to, outward);
                const lift = Math.sin(Math.PI * t);
                context.save();
                context.beginPath();
                mesh.forEach((point, i) => context[i ? 'lineTo' : 'moveTo'](point.x, point.top + lift * 8));
                [...mesh].reverse().forEach(point => context.lineTo(point.x, point.bottom + lift * 8));
                context.closePath();
                context.shadowColor = `rgba(0,0,0,${0.32 * lift})`;
                context.shadowBlur = 30 * lift;
                context.fillStyle = `rgba(0,0,0,${0.12 * lift})`;
                context.fill();
                context.restore();
                const hinge = mesh[0].x;
                const shadowWidth = Math.max(1, frontRect.width * 0.32 * lift);
                const shadow = context.createLinearGradient(hinge, 0, hinge + outward * shadowWidth, 0);
                shadow.addColorStop(0, `rgba(0,0,0,${0.32 * lift})`);
                shadow.addColorStop(1, 'rgba(0,0,0,0)');
                context.fillStyle = shadow;
                context.fillRect(outward > 0 ? hinge : hinge - shadowWidth, frontRect.y, shadowWidth, frontRect.height);
                // Light the texture continuously before projecting it; shading
                // separate quads would leave bright antialiasing seams.
                drawSheet(context, mesh, front, back, scratch);
                context.restore();
            };
            draw(0);
            reader.appendChild(overlay);

            const start = performance.now();
            const tick = now => {
                if (disposed) return;
                if (!isCurrent() || !reader.isConnected) { dispose(); onFinish(); return; }
                const progress = Math.min(1, (now - start) / DURATION);
                try { draw(progress); } catch (_) { dispose(); onFinish(); return; }
                if (progress === 1) { dispose(); onFinish(); }
                else frame = window.requestAnimationFrame(tick);
            };
            frame = window.requestAnimationFrame(tick);
            return dispose;
        } catch (error) {
            console.warn('BiliPocketReader: paper animation unavailable', error);
            dispose();
            if (!committed) commit();
            return null;
        }
    }

    window.BilibiliToolbox.paperTurn = { play, createMesh, DURATION, CANVAS_PIXEL_BUDGET };
})();

/* ============================================================
   PROBITY — contact card experience
   ------------------------------------------------------------
   Clicking "Contact" deals the printed card into a dark studio.
   Click it and it turns over: the back of the card is a real
   form you can type into.

   How the two halves stay welded together
   ---------------------------------------
   The card body is a WebGL mesh (three.js) so it can carry real
   material — laminated front, ink-black back, red-painted edges,
   a specular sweep as it turns. A form cannot live inside WebGL,
   so the back face is ordinary DOM rendered through CSS3DRenderer
   and driven by the SAME camera and the SAME rotation as the mesh.
   Both layers therefore agree, to the pixel, on where the card is.

   The one number that makes it work is PX: the camera distance is
   solved so that one world unit projects to exactly PX screen px
   at the card's plane. The CSS3D object is then scaled 1/PX, which
   renders the form at 1:1 — no resampled, blurry text.
   ============================================================ */

import * as THREE from 'three';
import { RoomEnvironment }              from './vendor/RoomEnvironment.js';
import { CSS3DRenderer, CSS3DObject }   from './vendor/CSS3DRenderer.js';

/* ---------- the printed card ---------- */
const CARD_SRC    = 'assets/probity-card.png';
const CARD_ASPECT = 1568 / 896;              /* 1.75 — a standard card  */
const MAIL_TO     = 'Vidyasagar.khuba@gmail.com';
const TEL_RAW     = '+919845724479';
const TEL_SHOWN   = '98457 24479 / 98803 23883';

/* ---------- projection contract ---------- */
const PX     = 200;   /* screen px per world unit, at the card plane   */
const FOV    = 32;
const THICK  = 7;     /* card stock, in the same px scale             */
const Z_BACK = (THICK / PX) / 2 + .004;  /* the read face: half a stock proud of centre */

const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ============================================================
   tiny tween — enough for a handful of scalars, no library
   ============================================================ */
const easeOutCubic   = t => 1 - Math.pow(1 - t, 3);
const easeOutBack    = t => { const c1 = 1.34, c3 = c1 + 1;
                              return 1 + c3*Math.pow(t-1,3) + c1*Math.pow(t-1,2); };

class Tw{
  constructor(v){ this.v = v; this.from = v; this.to = v; this.t = 1; this.dur = 0; this.ease = easeOutCubic; this.end = null; }
  set(v){ this.v = this.from = this.to = v; this.t = 1; this.dur = 0; this.end = null; return this; }
  go(to, dur, ease, end){
    this.from = this.v; this.to = to;
    this.t = 0; this.dur = calm ? Math.min(dur, .001) : dur;
    this.ease = ease || easeOutCubic; this.end = end || null;
    return this;
  }
  step(dt){
    if (this.t >= 1) return this.v;
    this.t = this.dur > 0 ? Math.min(1, this.t + dt / this.dur) : 1;
    this.v = this.from + (this.to - this.from) * this.ease(this.t);
    if (this.t >= 1 && this.end){ const f = this.end; this.end = null; f(); }
    return this.v;
  }
}

/* ============================================================
   markup — injected once, so both pages stay in step
   ============================================================ */
const ARROW = '<svg viewBox="0 0 15 10" fill="none" aria-hidden="true"><path d="M0 5h13M9 1l4 4-4 4" stroke="currentColor" stroke-width="1.4"/></svg>';
const BACK_ARROW = '<svg viewBox="0 0 15 10" fill="none" aria-hidden="true"><path d="M15 5H2M6 1L2 5l4 4" stroke="currentColor" stroke-width="1.4"/></svg>';

function build(){
  const root = document.createElement('div');
  root.className = 'pcx';
  root.id = 'pcx';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Contact Probity');
  root.innerHTML = `
    <div class="pcx-scrim" data-pcx-dismiss></div>

    <div class="pcx-stage">
      <canvas class="pcx-gl"></canvas>
      <div class="pcx-css3d"></div>
    </div>

    <div class="pcx-flat">
      <div class="pcx-flipper">
        <div class="pcx-flat-front"><img src="${CARD_SRC}" alt="Probity business card — Vidyasagar Khuba, Property Management and Consultancy"></div>
      </div>
    </div>

    <header class="pcx-chrome">
      <span class="pcx-eyebrow">Probity <s>/</s> Get in touch</span>
      <button class="pcx-close" type="button" aria-label="Close">
        <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      </button>
    </header>

    <footer class="pcx-foot">
      <button class="pcx-turn" type="button">Write to us ${ARROW}</button>
      <span class="pcx-note">or turn the card over</span>
    </footer>
  `;

  /* the back face lives outside the overlay tree until it is either
     handed to CSS3DRenderer or dropped into the flat fallback      */
  const back = document.createElement('div');
  back.className = 'pcx-back';
  back.innerHTML = `
    <button class="pcx-return" type="button">${BACK_ARROW} The card</button>

    <div class="pcx-head">
      <span class="pcx-kicker">Write to us</span>
      <h2 class="pcx-title">Tell us about the <em>property</em>.</h2>
    </div>

    <form class="pcx-form" novalidate>
      <div class="pcx-row">
        <div class="pcx-field">
          <label for="pcx-name">Your name</label>
          <span class="pcx-err">required</span>
          <input id="pcx-name" name="name" type="text" autocomplete="name" placeholder="Full name">
        </div>
        <div class="pcx-field">
          <label for="pcx-email">Email</label>
          <span class="pcx-err">check this</span>
          <input id="pcx-email" name="email" type="email" autocomplete="email" placeholder="you@example.com">
        </div>
      </div>

      <div class="pcx-field pcx-msg">
        <label for="pcx-msg">How can we help?</label>
        <span class="pcx-err">required</span>
        <textarea id="pcx-msg" name="message" rows="3" placeholder="Site, survey number, or the approval you're chasing."></textarea>
      </div>

      <div class="pcx-actions">
        <div class="pcx-direct">
          <a href="tel:${TEL_RAW}">
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M3.6 1.5 5.9 4 4.4 5.6a9.6 9.6 0 0 0 6 6L12 10.1l2.5 2.3-2 2a1.6 1.6 0 0 1-1.6.4A14 14 0 0 1 1.2 5.1a1.6 1.6 0 0 1 .4-1.6z"/></svg>
            ${TEL_SHOWN}
          </a>
          <a href="mailto:${MAIL_TO}">
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M1 3h14v10H1z" opacity=".35"/><path d="M1 3h14v1.2L8 9 1 4.2z"/></svg>
            ${MAIL_TO}
          </a>
        </div>
        <button class="pcx-send" type="submit">Send message ${ARROW}</button>
      </div>
    </form>

    <div class="pcx-sealed">
      <svg class="pcx-seal" viewBox="0 0 26 26" aria-hidden="true">
        <circle cx="13" cy="13" r="11.5" style="--len:73"/>
        <path class="inner" d="M9 17.5V8.5h4.6a3.2 3.2 0 0 1 0 6.4H9" style="--len:30"/>
      </svg>
      <h3>Your note is ready to send.</h3>
      <p>We handed it to your mail app with everything filled in — press send there and it reaches Vidyasagar directly.</p>
      <button class="pcx-again" type="button">Write another</button>
    </div>
  `;

  document.body.appendChild(root);
  return { root, back };
}

/* ============================================================
   the experience
   ============================================================ */
function init(){
  const { root, back } = build();

  const stage    = root.querySelector('.pcx-stage');
  const canvas   = root.querySelector('.pcx-gl');
  const cssHost  = root.querySelector('.pcx-css3d');
  const flat     = root.querySelector('.pcx-flat');
  const flipper  = root.querySelector('.pcx-flipper');
  const btnClose = root.querySelector('.pcx-close');
  const btnTurn  = root.querySelector('.pcx-turn');
  const btnBack  = back.querySelector('.pcx-return');
  const btnAgain = back.querySelector('.pcx-again');
  const form     = back.querySelector('.pcx-form');

  let state   = 'closed';      /* closed | front | turning | back      */
  let webgl   = true;
  let raf     = 0;
  let lastFocus = null;

  /* ---------- layout: one source of truth for both layers ---------- */
  const size = { fw:0, fh:0, bw:0, bh:0, mobile:false, vw:0, vh:0 };

  function measure(){
    const vw = stage.clientWidth  || window.innerWidth;
    const vh = stage.clientHeight || window.innerHeight;
    const mobile = vw < 760;

    /* the printed face keeps its true 3.5:2 proportion */
    let fw = mobile ? Math.min(vw * .88, 430) : Math.min(vw * .82, 760);
    let fh = fw / CARD_ASPECT;
    const capH = vh * (mobile ? .40 : .58);
    if (fh > capH){ fh = capH; fw = fh * CARD_ASPECT; }

    /* the back is the same plate on a desk, and a taller sheet on a
       phone — a card-shaped form at 375px would be unusable         */
    let bw = fw, bh = fh;
    if (mobile){
      bh = Math.min(fw / .66, vh * .70);
      bw = fw;
    }

    Object.assign(size, { fw, fh, bw, bh, mobile, vw, vh });

    if (webgl){
      /* CSS3D reads the plate's own box, so it is sized in px here */
      back.style.width  = Math.round(bw) + 'px';
      back.style.height = Math.round(bh) + 'px';
    } else {
      /* flat mode stretches the plate to the flipper instead */
      flipper.style.width  = Math.round(bw) + 'px';
      flipper.style.height = Math.round(bh) + 'px';
    }
  }

  /* ============================================================
     WEBGL
     ============================================================ */
  let renderer, cssRenderer, scene, cssScene, camera;
  let card, cardGroup, cssGroup, cssObj, halo, motes, glint;

  function setupGL(){
    renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true, powerPreference:'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    cssRenderer = new CSS3DRenderer();
    cssRenderer.domElement.style.position = 'absolute';
    cssRenderer.domElement.style.inset = '0';
    cssRenderer.domElement.style.pointerEvents = 'none';
    cssHost.appendChild(cssRenderer.domElement);

    scene    = new THREE.Scene();
    cssScene = new THREE.Scene();
    camera   = new THREE.PerspectiveCamera(FOV, 1, 0.1, 120);

    /* a small room, blurred, purely for the reflections in the stock */
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
    pmrem.dispose();

    /* --- lights: a warm key, a cool rim, and a glint that runs
           across the face while the card is turning ------------- */
    scene.add(new THREE.HemisphereLight(0x30405a, 0x05070b, .55));

    const key = new THREE.DirectionalLight(0xfff2da, 2.1);
    key.position.set(-3.4, 4.2, 5.2);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x9ab4d6, 1.35);
    rim.position.set(4.6, -1.4, -3.2);
    scene.add(rim);

    glint = new THREE.PointLight(0xffffff, 0, 14, 2);
    glint.position.set(0, 0, 2.4);
    scene.add(glint);

    /* --- the card ------------------------------------------------ */
    const tex = new THREE.TextureLoader().load(CARD_SRC, t => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      t.needsUpdate = true;
    });

    const faceFront = new THREE.MeshPhysicalMaterial({
      map: tex, roughness:.42, metalness:0,
      clearcoat:.55, clearcoatRoughness:.28
    });
    const faceBack = new THREE.MeshPhysicalMaterial({
      color:0xffffff, roughness:.42, metalness:0,
      clearcoat:.55, clearcoatRoughness:.28
    });
    /* painted edges — the one flash of the brand red */
    const edge = new THREE.MeshPhysicalMaterial({
      color:0xc8102e, roughness:.44, metalness:.05, clearcoat:.5
    });

    card = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      [edge, edge, edge, edge, faceFront, faceBack]
    );

    cardGroup = new THREE.Group();
    cardGroup.add(card);
    scene.add(cardGroup);

    /* --- the CSS3D twin: same parent transform, opposite face ---- */
    cssObj = new CSS3DObject(back);
    cssObj.rotation.y = Math.PI;   /* faces -z, so it reads once turned */

    cssGroup = new THREE.Group();
    cssGroup.add(cssObj);
    cssScene.add(cssGroup);

    /* --- a lit backdrop so the card isn't floating in nothing ---- */
    halo = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: radialTexture(), transparent:true, opacity:.5,
        blending:THREE.AdditiveBlending, depthWrite:false
      })
    );
    halo.position.z = -2.4;
    scene.add(halo);

    /* --- dust, barely there -------------------------------------- */
    const N = calm ? 0 : 190;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++){
      pos[i*3    ] = (Math.random() - .5) * 16;
      pos[i*3 + 1] = (Math.random() - .5) * 10;
      pos[i*3 + 2] = (Math.random() - .5) * 7 - 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    motes = new THREE.Points(g, new THREE.PointsMaterial({
      size:.028, color:0xe7d3ae, transparent:true, opacity:.5,
      blending:THREE.AdditiveBlending, depthWrite:false, sizeAttenuation:true
    }));
    scene.add(motes);
  }

  /* a soft round falloff, drawn once into a canvas */
  function radialTexture(){
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d').createRadialGradient(128,128,0, 128,128,128);
    g.addColorStop(0,   'rgba(120,146,186,.85)');
    g.addColorStop(.42, 'rgba(70,88,118,.34)');
    g.addColorStop(1,   'rgba(0,0,0,0)');
    const ctx = c.getContext('2d');
    ctx.fillStyle = g; ctx.fillRect(0,0,256,256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* ---------- resize / reframe ---------- */
  function resize(){
    measure();
    if (!webgl) return;

    const { vw, vh } = size;
    renderer.setSize(vw, vh, false);
    cssRenderer.setSize(vw, vh);

    camera.aspect = vw / vh;
    /* solve the distance that makes one world unit === PX screen px */
    const D = vh / (2 * PX * Math.tan(THREE.MathUtils.degToRad(FOV) / 2));
    camera.position.z = D;
    camera.updateProjectionMatrix();

    /* Once the card has turned, the face being read is half a stock
       NEARER the camera than the mid-plane the projection was solved
       for, so perspective would render the plate ~0.3% large and
       resample every glyph. Take that magnification back out and the
       form lands exactly 1:1 while it is being read and typed into. */
    cssObj.position.z = -Z_BACK;
    cssObj.scale.setScalar((1 / PX) * ((D - Z_BACK) / D));

    applyCardSize();
    halo.scale.set(size.fw / PX * 3.4, size.fh / PX * 4.4, 1);
  }

  /* the plate grows into a sheet once it has turned — but only on a
     phone, and only after the front face is out of sight            */
  function applyCardSize(){
    const k = size.mobile ? Math.min(1, Math.max(0, (flip.v - .5) / .35)) : 0;
    const w = size.fw + (size.bw - size.fw) * easeOutCubic(k);
    const h = size.fh + (size.bh - size.fh) * easeOutCubic(k);
    card.scale.set(w / PX, h / PX, THICK / PX);
  }

  /* ============================================================
     motion
     ============================================================ */
  const entry = new Tw(0);
  const flip  = new Tw(0);
  const point = { x:0, y:0, tx:0, ty:0 };
  let clock = null, elapsed = 0;

  function loop(){
    raf = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), .05);
    elapsed += dt;

    entry.step(dt);
    const f = flip.step(dt);

    /* pointer parallax — silenced once the form is up, so the type
       on the back stays perfectly square to the camera             */
    const wantParallax = (state === 'front') && !calm;
    point.tx = wantParallax ? point.tx : 0;
    point.ty = wantParallax ? point.ty : 0;
    point.x += (point.tx - point.x) * Math.min(1, dt * 3.4);
    point.y += (point.ty - point.y) * Math.min(1, dt * 3.4);

    const e = entry.v;
    const idleBob = (calm || state !== 'front') ? 0 : Math.sin(elapsed * .75) * .035;

    cardGroup.position.set(
      (1 - e) * -1.1,
      (1 - e) * -1.5 + idleBob,
      (1 - e) * -3.4 + Math.sin(Math.min(f, 1) * Math.PI) * .9
    );
    cardGroup.rotation.set(
      (1 - e) * -.55 + point.y * .26 + (calm || state !== 'front' ? 0 : Math.sin(elapsed * .52) * .022),
      (1 - e) * -.85 + point.x * .34 + f * Math.PI,
      (1 - e) *  .28
    );

    applyCardSize();

    /* the CSS3D twin copies the group outright — no drift possible */
    cssGroup.position.copy(cardGroup.position);
    cssGroup.quaternion.copy(cardGroup.quaternion);

    /* the glint runs across the face mid-turn */
    const turning = f > .001 && f < .999;
    glint.intensity = turning ? 9 * Math.sin(Math.min(f,1) * Math.PI) : 0;
    glint.position.x = -3.4 + 6.8 * f;

    /* the back only becomes visible once it is actually facing us  */
    back.classList.toggle('is-lit', f > .62);

    if (motes && !calm){
      motes.rotation.y = elapsed * .012;
      motes.position.y = Math.sin(elapsed * .18) * .25;
    }
    halo.material.opacity = .5 * e;

    renderer.render(scene, camera);
    cssRenderer.render(cssScene, camera);
  }

  /* ============================================================
     open / close / turn
     ============================================================ */
  function open(){
    if (state !== 'closed') return;
    lastFocus = document.activeElement;

    root.classList.add('is-open');
    document.documentElement.classList.add('pcx-lock');
    /* the page's own menu script clears body overflow on link click,
       so the lock lives on <html> where it cannot be stomped on     */

    state = 'front';
    back.classList.remove('is-sealed', 'is-lit');
    root.classList.remove('is-back', 'is-turning');

    if (webgl){
      resize();
      flip.set(0);
      entry.set(0).go(1, calm ? .01 : 1.15, easeOutCubic);
      elapsed = 0;
      clock = clock || new THREE.Clock();
      clock.getDelta();
      cancelAnimationFrame(raf);
      loop();
    }

    requestAnimationFrame(() => {
      root.classList.add('is-in');
      btnClose.focus({ preventScroll:true });
    });
  }

  function close(){
    if (state === 'closed') return;
    state = 'closed';
    root.classList.remove('is-in', 'is-back', 'is-turning');
    document.documentElement.classList.remove('pcx-lock');

    setTimeout(() => {
      if (state !== 'closed') return;
      root.classList.remove('is-open');
      cancelAnimationFrame(raf); raf = 0;
      back.classList.remove('is-lit');
    }, calm ? 10 : 460);

    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll:true });
  }

  function turn(toBack){
    if (state === 'turning') return;
    if (toBack && state !== 'front') return;
    if (!toBack && state !== 'back') return;

    state = 'turning';
    root.classList.add('is-turning');
    root.classList.toggle('is-back', toBack);

    const land = () => {
      state = toBack ? 'back' : 'front';
      root.classList.remove('is-turning');
      if (toBack){
        const first = back.querySelector('input, textarea');
        if (first) first.focus({ preventScroll:true });
      } else {
        btnTurn.focus({ preventScroll:true });
      }
    };

    if (!webgl){ setTimeout(land, calm ? 10 : 1160); return; }

    if (calm){ flip.set(toBack ? 1 : 0); land(); return; }

    /* a beat of anticipation, then the turn, settling with a nudge */
    const from = flip.v;
    flip.go(from + (toBack ? -.045 : .045), .16, easeOutCubic, () => {
      flip.go(toBack ? 1 : 0, 1.02, easeOutBack, land);
    });
  }

  /* ============================================================
     the form
     ============================================================ */
  const okEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

  function mark(field, bad){ field.classList.toggle('is-bad', bad); return !bad; }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const name = back.querySelector('#pcx-name');
    const mail = back.querySelector('#pcx-email');
    const msg  = back.querySelector('#pcx-msg');

    let ok = true;
    ok = mark(name.closest('.pcx-field'), !name.value.trim())  && ok;
    ok = mark(mail.closest('.pcx-field'), !okEmail(mail.value)) && ok;
    ok = mark(msg.closest('.pcx-field'),  !msg.value.trim())   && ok;
    if (!ok){ (back.querySelector('.is-bad input, .is-bad textarea') || name).focus(); return; }

    /* No server sits behind this page, so the note is handed to the
       visitor's own mail client fully composed. Swap this block for
       a fetch() when an endpoint exists.                           */
    const subject = `Website enquiry — ${name.value.trim()}`;
    const body    = `${msg.value.trim()}\n\n—\n${name.value.trim()}\n${mail.value.trim()}`;
    const href    = `mailto:${MAIL_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    back.classList.add('is-sealed');
    window.setTimeout(() => { window.location.href = href; }, 260);
  });

  [...back.querySelectorAll('input, textarea')].forEach(el => {
    el.addEventListener('input', () => el.closest('.pcx-field').classList.remove('is-bad'));
  });

  btnAgain.addEventListener('click', () => {
    form.reset();
    [...back.querySelectorAll('.pcx-field')].forEach(f => f.classList.remove('is-bad'));
    back.classList.remove('is-sealed');
    const first = back.querySelector('input');
    if (first) first.focus({ preventScroll:true });
  });

  /* ============================================================
     wiring
     ============================================================ */
  btnClose.addEventListener('click', close);
  btnTurn .addEventListener('click', () => turn(true));
  btnBack .addEventListener('click', () => turn(false));

  root.addEventListener('click', e => {
    if (e.target.hasAttribute && e.target.hasAttribute('data-pcx-dismiss')) close();
  });

  document.addEventListener('keydown', e => {
    if (state === 'closed') return;
    if (e.key === 'Escape'){ e.preventDefault(); close(); return; }
    if (e.key === 'Tab') trapFocus(e);
  });

  /* only the face that is actually turned toward the visitor takes tab */
  function trapFocus(e){
    const onBack   = state === 'back';
    const sealed   = back.classList.contains('is-sealed');
    const pool = [...root.querySelectorAll('button, input, textarea, a[href]')].filter(el => {
      if (el.disabled) return false;
      const inBack = !!el.closest('.pcx-back');
      if (inBack !== onBack) return false;
      if (inBack && !!el.closest('.pcx-sealed') !== sealed) return false;
      if (inBack && sealed && !el.closest('.pcx-sealed')) return false;
      return true;
    });
    if (!pool.length) return;
    const first = pool[0], last = pool[pool.length - 1];
    if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  }

  /* clicking the card itself turns it */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  canvas.addEventListener('pointerdown', e => {
    if (state !== 'front') return;
    const r = canvas.getBoundingClientRect();
    ndc.x =  ((e.clientX - r.left) / r.width)  * 2 - 1;
    ndc.y = -((e.clientY - r.top)  / r.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    if (ray.intersectObject(card, false).length) turn(true);
    else close();
  });
  flat.addEventListener('click', e => {
    if (state === 'front' && e.target.closest('.pcx-flat-front')) turn(true);
    else if (!e.target.closest('.pcx-flipper')) close();
  });

  if (window.matchMedia('(pointer:fine)').matches){
    window.addEventListener('mousemove', e => {
      if (state !== 'front') return;
      point.tx = (e.clientX / window.innerWidth  - .5);
      point.ty = (e.clientY / window.innerHeight - .5);
    }, { passive:true });
  }

  window.addEventListener('resize', () => {
    if (state === 'closed') { measure(); return; }
    resize();
  }, { passive:true });

  /* ---------- boot ---------- */
  try{
    setupGL();
    resize();
  } catch (err){
    webgl = false;
    console.warn('[probity] WebGL unavailable — falling back to a flat card.', err);
    root.classList.add('is-flat');
    flipper.appendChild(back);
    back.classList.add('is-lit');
    back.style.width = ''; back.style.height = '';
    measure();
  }

  /* every route into the card */
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href$="#contact"]');
    if (!a) return;
    e.preventDefault();
    open();
  });

  window.pcxContact = { open, close };
}

/* the overlay is inert until the DOM it decorates exists */
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

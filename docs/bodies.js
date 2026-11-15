/* Realistic Sun and Earth for the 3D view. Loaded after app.js. */
(function () {
  'use strict';
  console.log('SoloHorizon Tech: realistic Sun and Earth (v4)');

  var earthMat = null, atmMat = null;

  /* ---------- shared GLSL noise ---------- */
  var NOISE = `
    float hash(vec3 p) {
      p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    float noise(vec3 x) {
      vec3 i = floor(x);
      vec3 f = fract(x);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
            mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
        mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
            mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
        f.z);
    }
    float fbm(vec3 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p = p * 2.03 + vec3(1.7);
        a *= 0.5;
      }
      return v;
    }
  `;

  var BODY_VERT = `
    varying vec3 vN;
    varying vec3 vWorld;
    void main() {
      vN = normalize(position);
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;

  var EARTH_FRAG = `
    uniform vec3 sunDir;
    uniform float spin;
    varying vec3 vN;
    varying vec3 vWorld;
    ${NOISE}
    void main() {
      vec3 N = normalize(vN);
      vec3 S = normalize(sunDir);
      vec3 V = normalize(cameraPosition - vWorld);

      // rotate the surface pattern (Earth spins), lighting stays fixed to the Sun
      float ca = cos(spin);
      float sa = sin(spin);
      vec3 p = vec3(ca * N.x + sa * N.z, N.y, -sa * N.x + ca * N.z);

      float cont = fbm(p * 1.7 + vec3(4.0));
      float land = smoothstep(0.50, 0.53, cont);
      float coast = smoothstep(0.44, 0.50, cont);
      vec3 ocean = mix(vec3(0.02, 0.10, 0.32), vec3(0.06, 0.30, 0.55), coast);

      float lat = abs(p.y);
      float dry = smoothstep(0.35, 0.65, fbm(p * 3.0 + vec3(9.0)));
      vec3 landc = mix(vec3(0.10, 0.32, 0.10), vec3(0.55, 0.45, 0.26), dry * (1.0 - smoothstep(0.5, 0.8, lat)));
      vec3 surf = mix(ocean, landc, land);

      float ice = smoothstep(0.84, 0.92, lat + 0.06 * fbm(p * 6.0));
      surf = mix(surf, vec3(0.93, 0.95, 1.0), ice);

      float cl = smoothstep(0.52, 0.72, fbm(p * 3.2 + vec3(2.0, 7.0, 1.0)));
      vec3 base = mix(surf, vec3(1.0), cl * 0.85);

      float diff = max(dot(N, S), 0.0);
      float lit = smoothstep(-0.05, 0.12, dot(N, S));
      vec3 H = normalize(S + V);
      float glint = pow(max(dot(N, H), 0.0), 60.0) * (1.0 - land) * (1.0 - cl) * 0.6;

      vec3 col = base * (0.03 + 1.1 * diff * lit) + vec3(glint) * lit;
      col = pow(col, vec3(1.0 / 2.2));
      gl_FragColor = vec4(col, 1.0);
    }`;

  var ATM_FRAG = `
    uniform vec3 sunDir;
    varying vec3 vN;
    varying vec3 vWorld;
    void main() {
      vec3 N = normalize(vN);
      vec3 V = normalize(cameraPosition - vWorld);
      float rim = pow(1.0 - max(dot(N, V), 0.0), 2.5);
      float lit = smoothstep(-0.3, 0.4, dot(N, normalize(sunDir)));
      vec3 c = vec3(0.35, 0.62, 1.0) * rim * (0.15 + 0.85 * lit);
      gl_FragColor = vec4(c, rim * (0.2 + 0.8 * lit));
    }`;

  /* ---------- Sun textures ---------- */
  function radialTexture(stops) {
    var c = document.createElement('canvas');
    c.width = c.height = 256;
    var g = c.getContext('2d');
    var gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); });
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }

  function raysTexture() {
    var s = 512;
    var c = document.createElement('canvas');
    c.width = c.height = s;
    var g = c.getContext('2d');
    g.translate(s / 2, s / 2);
    for (var i = 0; i < 14; i++) {
      g.save();
      g.rotate(i * Math.PI * 2 / 14 + (i % 2) * 0.1);
      var len = i % 2 ? s * 0.30 : s * 0.48;
      var gr = g.createLinearGradient(0, 0, len, 0);
      gr.addColorStop(0, 'rgba(255,240,190,0.55)');
      gr.addColorStop(1, 'rgba(255,200,100,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(0, -5);
      g.lineTo(len, 0);
      g.lineTo(0, 5);
      g.closePath();
      g.fill();
      g.restore();
    }
    return new THREE.CanvasTexture(c);
  }

  /* ---------- Replace the simple Sun and Earth ---------- */
  function upgrade() {
    var scene = R.scene;

    // Sun: halo + rays + bright core
    scene.remove(R.sun);
    var sun = new THREE.Group();
    function layer(tex, size) {
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      sp.scale.set(size, size, 1);
      sun.add(sp);
      return sp;
    }
    layer(radialTexture([[0, 'rgba(255,200,90,0.45)'], [0.35, 'rgba(255,170,60,0.15)'], [1, 'rgba(255,140,30,0)']]), 1.7);
    var rays = layer(raysTexture(), 1.25);
    layer(radialTexture([[0, 'rgba(255,255,255,1)'], [0.10, 'rgba(255,250,225,1)'], [0.22, 'rgba(255,225,140,0.85)'],
                         [0.45, 'rgba(255,170,50,0.28)'], [1, 'rgba(255,120,20,0)']]), 0.5);
    R.sun = sun;
    scene.add(sun);

    // Earth: oceans, land, ice, clouds, atmosphere glow
    scene.remove(R.earth);
    earthMat = new THREE.ShaderMaterial({
      uniforms: { sunDir: { value: new THREE.Vector3(1, 0, 0) }, spin: { value: 0 } },
      vertexShader: BODY_VERT,
      fragmentShader: EARTH_FRAG
    });
    var earth = new THREE.Mesh(new THREE.SphereGeometry(0.16, 64, 48), earthMat);

    atmMat = new THREE.ShaderMaterial({
      uniforms: { sunDir: { value: new THREE.Vector3(1, 0, 0) } },
      vertexShader: BODY_VERT,
      fragmentShader: ATM_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    earth.add(new THREE.Mesh(new THREE.SphereGeometry(0.16 * 1.12, 64, 48), atmMat));
    R.earth = earth;
    scene.add(earth);

    // Keep Earth's day/night side and spin in sync with the time slider
    var baseUpdate = window.updateMoon;
    window.updateMoon = function (i) {
      baseUpdate(i);
      var S = R.moonMat.uniforms.sunDir.value;
      earthMat.uniforms.sunDir.value.copy(S);
      atmMat.uniforms.sunDir.value.copy(S);
      earthMat.uniforms.spin.value = ((i % 24) / 24) * Math.PI * 2;
    };

    // Slowly rotating Sun rays
    (function turn() {
      requestAnimationFrame(turn);
      rays.material.rotation += 0.0012;
    })();

    // Redraw once so the new objects are placed correctly
    if (typeof VIEW !== 'undefined' && VIEW && typeof drawAt === 'function') {
      drawAt(parseInt(document.getElementById('timeSlider').value));
    }
  }

  // Wait until app.js has built the 3D scene, then upgrade
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    if (tries > 200) { clearInterval(timer); return; }
    if (typeof R === 'undefined' || !R.scene || !R.sun || !R.earth || !R.moonMat) return;
    clearInterval(timer);
    upgrade();
  }, 100);
})();
const TRACK_LEVELS = [
  {
    name: 'Training Oval',
    difficulty: 'Novice',
    description:
      'Wide, sweeping turns that emphasize smooth throttle control and stable steering. Ideal for baseline policy evaluation.',
    color: 0x3f7bff,
    width: 1.9,
    checkpointRadius: 2.7,
    spawn: { position: [0, 0.25, -11], heading: 0 },
    path: [
      [0, -12],
      [5, -11],
      [10, -7],
      [12, 0],
      [10, 7],
      [5, 11],
      [0, 12],
      [-5, 11],
      [-10, 7],
      [-12, 0],
      [-10, -7],
      [-5, -11],
    ],
    checkpoints: [
      [0, -11],
      [9, 0],
      [0, 11],
      [-9, 0],
    ],
  },
  {
    name: 'Switchback Sprint',
    difficulty: 'Intermediate',
    description:
      'Tight chicanes and hairpins push braking and steering precision. Perfect for experimenting with look-ahead controllers.',
    color: 0x3ad7a3,
    width: 1.45,
    checkpointRadius: 2.2,
    spawn: { position: [-11, 0.25, -7], heading: Math.PI / 6 },
    path: [
      [-12, -8],
      [-8, -11],
      [-2, -9],
      [4, -7],
      [10, -3],
      [12, 2],
      [8, 6],
      [2, 9],
      [-4, 10],
      [-10, 7],
      [-12, 1],
      [-8, -3],
    ],
    checkpoints: [
      [-11, -7],
      [-2, -3],
      [7, 1],
      [1, 8],
      [-8, 5],
    ],
  },
  {
    name: 'Spiral Gauntlet',
    difficulty: 'Advanced',
    description:
      'A narrowing spiral with sweeping radius changes that reward predictive control policies and adaptive braking strategies.',
    color: 0xff7a4d,
    width: 1.15,
    checkpointRadius: 2.0,
    spawn: { position: [0, 0.25, -9], heading: 0 },
    path: [
      [0, -10],
      [6, -8],
      [10, -2],
      [9, 4],
      [5, 9],
      [-1, 10],
      [-7, 8],
      [-10, 3],
      [-9, -3],
      [-4, -8],
      [2, -9],
      [7, -4],
      [6, 2],
      [2, 6],
      [-3, 6],
      [-6, 2],
      [-5, -3],
      [-1, -6],
      [3, -6],
      [5, -3],
      [3, 0],
      [0, 2],
      [-2, 0],
      [-1, -3],
    ],
    checkpoints: [
      [0, -9],
      [8, -1],
      [2, 7],
      [-7, 5],
      [-2, -5],
    ],
  },
];

const TRAINING_DEFAULTS = {
  stepDuration: 1 / 60,
  reward: {
    progress: 1,
    centerline: 0.6,
    offTrack: 4,
    smoothness: 0.3,
    brake: 0.2,
    checkpointBonus: 8,
    lapBonus: 25,
  },
  termination: {
    offTrackSteps: 120,
    noProgressSteps: 240,
    maxSteps: 5400,
    progressThreshold: 0.0002,
  },
};

class RacingLab {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f1017);
    this.scene.fog = new THREE.Fog(0x06070c, 60, 120);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      250
    );
    this.camera.position.set(0, 14, 18);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    this.cameraMode = 'follow';

    this.lastTime = performance.now();
    this.currentTimeMs = 0;
    this.lastTimestamp = this.currentTimeMs;
    this.simulationPaused = false;
    this.trainingSession = null;

    this.lastTrackProjection = {
      t: 0,
      distance: 0,
      closestPoint: new THREE.Vector3(),
      tangent: new THREE.Vector3(0, 0, 1),
    };

    this.keys = {};
    this.externalControl = { throttle: 0, brake: 0, steer: 0 };
    this.controlMode = 'manual';

    this.params = {
      acceleration: 10.5,
      reverseAcceleration: 6.0,
      brakeStrength: 18,
      drag: 0.42,
      rollingResistance: 1.35,
      offTrackResistance: 7.5,
      maxSpeed: 22,
      maxReverseSpeed: 7,
      maxSteer: THREE.MathUtils.degToRad(34),
      steerRate: THREE.MathUtils.degToRad(155),
      wheelBase: 2.6,
    };

    this._buildEnvironment();
    this.car = this._buildCar();

    this.checkpointMaterials = {
      idle: new THREE.MeshStandardMaterial({
        color: 0x1d2534,
        transparent: true,
        opacity: 0.35,
        metalness: 0.1,
        roughness: 0.6,
      }),
      active: new THREE.MeshStandardMaterial({
        color: 0xffd166,
        emissive: 0x7d4b00,
        emissiveIntensity: 0.7,
        transparent: true,
        opacity: 0.85,
      }),
      passed: new THREE.MeshStandardMaterial({
        color: 0x6cf5b3,
        emissive: 0x0e5431,
        emissiveIntensity: 0.65,
        transparent: true,
        opacity: 0.65,
      }),
    };

    this.trackMesh = null;
    this.startLine = null;
    this.checkpoints = [];
    this.trackSamples = [];

    this.activeCheckpoint = 0;
    this.offTrack = false;
    this.distanceFromCenter = 0;

    this.lapTimes = [];
    this.lastLapTime = null;
    this.bestLapTime = null;
    this.lapStartTime = null;

    this.hud = {
      telemetry: document.getElementById('telemetry'),
      instructions: document.getElementById('instructions'),
      flash: document.getElementById('lapFlash'),
    };

    this.lapFlashTimeout = null;

    window.addEventListener('resize', () => this._onResize());
    window.addEventListener('keydown', (e) => this._handleKeyDown(e));
    window.addEventListener('keyup', (e) => this._handleKeyUp(e));

    this.loadLevel(0);
    this.animate();
  }

  _buildEnvironment() {
    const ambient = new THREE.AmbientLight(0xb9c5ff, 0.22);
    const hemi = new THREE.HemisphereLight(0xaec6ff, 0x0b0d13, 0.75);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(18, 26, 12);

    this.scene.add(ambient, hemi, dirLight);

    const groundGeometry = new THREE.PlaneGeometry(220, 220, 10, 10);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x101522,
      roughness: 0.9,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(220, 110, 0x22304a, 0x131a2b);
    grid.position.y = 0.01;
    this.scene.add(grid);
  }

  _buildCar() {
    const group = new THREE.Group();

    const chassisGeometry = new THREE.BoxGeometry(1.4, 0.4, 2.6);
    const chassisMaterial = new THREE.MeshStandardMaterial({
      color: 0xff5533,
      metalness: 0.35,
      roughness: 0.45,
    });
    const chassis = new THREE.Mesh(chassisGeometry, chassisMaterial);
    chassis.position.y = 0.2;
    group.add(chassis);

    const canopyGeometry = new THREE.BoxGeometry(1.05, 0.35, 1.2);
    const canopyMaterial = new THREE.MeshStandardMaterial({
      color: 0xf8f9fb,
      metalness: 0.1,
      roughness: 0.2,
    });
    const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
    canopy.position.set(0, 0.5, -0.1);
    group.add(canopy);

    const wheelGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 22);
    wheelGeometry.rotateZ(Math.PI / 2);
    const wheelMaterial = new THREE.MeshStandardMaterial({
      color: 0x0c0c0f,
      roughness: 0.9,
    });
    const wheelOffsets = [
      [0.7, 0, 1.1],
      [-0.7, 0, 1.1],
      [0.7, 0, -1.1],
      [-0.7, 0, -1.1],
    ];
    wheelOffsets.forEach(([x, y, z]) => {
      const wheel = new THREE.Mesh(wheelGeometry.clone(), wheelMaterial);
      wheel.position.set(x, 0.15 + y, z);
      group.add(wheel);
    });

    group.position.set(0, 0.25, 0);
    this.scene.add(group);

    return {
      mesh: group,
      position: group.position,
      speed: 0,
      heading: 0,
      steerAngle: 0,
    };
  }

  loadLevel(index) {
    const levelIndex = THREE.MathUtils.euclideanModulo(index, TRACK_LEVELS.length);
    const level = TRACK_LEVELS[levelIndex];

    if (this.trackMesh) {
      this.scene.remove(this.trackMesh);
      this.trackMesh.geometry.dispose();
      this.trackMesh.material.dispose();
      this.trackMesh = null;
    }

    if (this.startLine) {
      this.scene.remove(this.startLine);
      this.startLine.geometry.dispose();
      this.startLine.material.dispose();
      this.startLine = null;
    }

    if (this.checkpoints.length) {
      this.checkpoints.forEach((checkpoint) => {
        this.scene.remove(checkpoint.mesh);
        checkpoint.mesh.geometry.dispose();
      });
    }
    this.checkpoints = [];

    this.levelIndex = levelIndex;
    this.level = level;

    const pathVectors = level.path.map(([x, z]) => new THREE.Vector3(x, 0.05, z));
    this.levelCurve = new THREE.CatmullRomCurve3(pathVectors, true, 'catmullrom', 0.1);
    this.trackLength = this.levelCurve.getLength();

    const segments = Math.max(pathVectors.length * 12, 180);
    const trackGeometry = new THREE.TubeGeometry(
      this.levelCurve,
      segments,
      level.width,
      24,
      true
    );
    const trackMaterial = new THREE.MeshStandardMaterial({
      color: level.color,
      roughness: 0.35,
      metalness: 0.25,
      emissive: new THREE.Color(level.color).multiplyScalar(0.1),
    });
    this.trackMesh = new THREE.Mesh(trackGeometry, trackMaterial);
    this.trackMesh.position.y = 0.08;
    this.trackMesh.scale.y = 0.2;
    this.scene.add(this.trackMesh);

    this.trackSamples = [];
    const sampleCount = 720;
    for (let i = 0; i < sampleCount; i += 1) {
      const t = i / sampleCount;
      const point = this.levelCurve.getPointAt(t);
      this.trackSamples.push({ point, t });
    }

    const checkpointGeometry = new THREE.CylinderGeometry(
      level.checkpointRadius,
      level.checkpointRadius,
      0.2,
      32,
      1,
      true
    );
    level.checkpoints.forEach(([x, z], idx) => {
      const mesh = new THREE.Mesh(checkpointGeometry.clone(), this.checkpointMaterials.idle);
      mesh.position.set(x, 0.12, z);
      mesh.rotation.x = Math.PI / 2;
      this.scene.add(mesh);

      this.checkpoints.push({
        index: idx,
        position: new THREE.Vector3(x, 0.1, z),
        mesh,
      });
    });
    checkpointGeometry.dispose();

    if (this.checkpoints.length > 1) {
      const start = this.checkpoints[0].position.clone();
      const next = this.checkpoints[1].position.clone();
      const direction = next.clone().sub(start).normalize();
      const angle = Math.atan2(direction.x, direction.z) + Math.PI / 2;
      const startGeometry = new THREE.PlaneGeometry(level.width * 2.2, 0.8);
      const startMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      });
      this.startLine = new THREE.Mesh(startGeometry, startMaterial);
      this.startLine.rotation.x = -Math.PI / 2;
      this.startLine.rotation.y = angle;
      this.startLine.position.copy(start);
      this.startLine.position.y = 0.11;
      this.scene.add(this.startLine);
    }

    this.activeCheckpoint = 0;
    this.offTrack = false;
    this.distanceFromCenter = 0;

    this.lapTimes = [];
    this.lastLapTime = null;
    this.bestLapTime = null;
    this.lapStartTime = null;

    this._updateInstructions();
    this.resetCar({ preserveLapTimes: false });
  }

  resetCar({ preserveLapTimes = true } = {}) {
    if (!this.level) return;

    const [x, y, z] = this.level.spawn.position;
    this.car.position.set(x, y, z);
    this.car.heading = this.level.spawn.heading;
    this.car.speed = 0;
    this.car.steerAngle = 0;
    this.car.mesh.position.copy(this.car.position);
    this.car.mesh.rotation.set(0, this.car.heading, 0);

    this.activeCheckpoint = 0;
    this.offTrack = false;

    this.checkpoints.forEach((checkpoint) => {
      checkpoint.mesh.material = this.checkpointMaterials.idle;
    });
    if (this.checkpoints[0]) {
      this.checkpoints[0].mesh.material = this.checkpointMaterials.active;
    }

    if (!preserveLapTimes) {
      this.lapTimes = [];
      this.lastLapTime = null;
      this.bestLapTime = null;
    }
    this.lapStartTime = this.currentTimeMs;
  }

  setControlMode(mode) {
    this.controlMode = mode === 'external' ? 'external' : 'manual';
    if (this.controlMode === 'manual') {
      this.externalControl = { throttle: 0, brake: 0, steer: 0 };
    }
  }

  setExternalControl(control = {}) {
    this.externalControl = this._sanitizeControlInput(control);
    if (control.reset === true) {
      this.resetCar({ preserveLapTimes: true });
    }
  }

  setCameraMode(mode) {
    this.cameraMode = mode === 'overview' ? 'overview' : 'follow';
  }

  toggleCameraMode() {
    this.setCameraMode(this.cameraMode === 'follow' ? 'overview' : 'follow');
  }

  _handleKeyDown(event) {
    const key = event.key.toLowerCase();
    if (
      ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key) ||
      ['w', 'a', 's', 'd'].includes(key)
    ) {
      event.preventDefault();
    }

    switch (key) {
      case 'r':
        this.resetCar({ preserveLapTimes: true });
        return;
      case 'n':
        this.loadLevel(this.levelIndex + 1);
        return;
      case 'p':
        this.loadLevel(this.levelIndex - 1);
        return;
      case 'm':
        this.setControlMode('manual');
        return;
      case 'g':
        this.setControlMode('external');
        return;
      case 'c':
        this.toggleCameraMode();
        return;
      default:
        break;
    }

    this.keys[key] = true;
  }

  _handleKeyUp(event) {
    const key = event.key.toLowerCase();
    this.keys[key] = false;
  }

  _isKeyActive(key) {
    return Boolean(this.keys[key]);
  }

  _sanitizeControlInput(control = {}) {
    return {
      throttle: THREE.MathUtils.clamp(
        control.throttle ?? control.accelerate ?? control.forward ?? 0,
        -1,
        1
      ),
      brake: THREE.MathUtils.clamp(control.brake ?? control.handbrake ?? 0, 0, 1),
      steer: THREE.MathUtils.clamp(control.steer ?? control.turn ?? 0, -1, 1),
    };
  }

  resolveControls() {
    if (this.controlMode === 'external') {
      return { ...this.externalControl };
    }

    let throttle = 0;
    if (this._isKeyActive('w') || this._isKeyActive('arrowup')) throttle += 1;
    if (this._isKeyActive('s') || this._isKeyActive('arrowdown')) throttle -= 1;

    let steer = 0;
    if (this._isKeyActive('a') || this._isKeyActive('arrowleft')) steer -= 1;
    if (this._isKeyActive('d') || this._isKeyActive('arrowright')) steer += 1;

    const brake = this._isKeyActive(' ');

    return {
      throttle: THREE.MathUtils.clamp(throttle, -1, 1),
      steer: THREE.MathUtils.clamp(steer, -1, 1),
      brake: brake ? 1 : 0,
    };
  }

  updatePhysics(dt, controlOverride) {
    const controls = controlOverride
      ? this._sanitizeControlInput(controlOverride)
      : this.resolveControls();
    const steerTarget = THREE.MathUtils.clamp(controls.steer, -1, 1) * this.params.maxSteer;
    const steerDelta = steerTarget - this.car.steerAngle;
    const maxSteerChange = this.params.steerRate * dt;
    this.car.steerAngle += THREE.MathUtils.clamp(steerDelta, -maxSteerChange, maxSteerChange);

    const throttleInput = THREE.MathUtils.clamp(controls.throttle ?? 0, -1, 1);
    const brakeInput = THREE.MathUtils.clamp(controls.brake ?? 0, 0, 1);

    let acceleration = 0;
    if (throttleInput >= 0) {
      acceleration += throttleInput * this.params.acceleration;
    } else {
      acceleration += throttleInput * this.params.reverseAcceleration;
    }

    if (brakeInput > 0) {
      acceleration -= Math.sign(this.car.speed) * brakeInput * this.params.brakeStrength;
    }

    const drag = this.params.drag * this.car.speed * Math.abs(this.car.speed);
    const rolling = this.params.rollingResistance * Math.sign(this.car.speed);
    acceleration -= drag;
    if (Math.abs(this.car.speed) > 0.05) {
      acceleration -= rolling;
    }

    if (this.offTrack) {
      acceleration -= Math.sign(this.car.speed) * this.params.offTrackResistance;
    }

    this.car.speed += acceleration * dt;
    this.car.speed = THREE.MathUtils.clamp(
      this.car.speed,
      -this.params.maxReverseSpeed,
      this.params.maxSpeed
    );
    if (Math.abs(this.car.speed) < 0.01 && throttleInput === 0 && brakeInput === 0) {
      this.car.speed = 0;
    }

    const forward = new THREE.Vector3(
      Math.sin(this.car.heading),
      0,
      Math.cos(this.car.heading)
    );
    this.car.position.addScaledVector(forward, this.car.speed * dt);
    this.car.position.y = this.level.spawn.position[1];

    const angularVelocity = (this.car.speed / this.params.wheelBase) * Math.tan(this.car.steerAngle);
    this.car.heading += angularVelocity * dt;
    this.car.mesh.position.copy(this.car.position);
    this.car.mesh.rotation.set(0, this.car.heading, 0);
  }

  handleCheckpoints() {
    if (!this.level || !this.checkpoints.length) return;

    const checkpoint = this.checkpoints[this.activeCheckpoint];
    if (!checkpoint) return;

    const distance = checkpoint.position.distanceTo(this.car.position);
    if (distance <= this.level.checkpointRadius) {
      checkpoint.mesh.material = this.checkpointMaterials.passed;
      this.activeCheckpoint += 1;

      if (this.activeCheckpoint >= this.checkpoints.length) {
        const now = this.currentTimeMs;
        if (this.lapStartTime) {
          const lapMs = now - this.lapStartTime;
          this.lapTimes.push(lapMs);
          this.lastLapTime = lapMs;
          this.bestLapTime = this.bestLapTime ? Math.min(this.bestLapTime, lapMs) : lapMs;
          this._showLapFlash(lapMs);
        }
        this.lapStartTime = now;
        this.activeCheckpoint = 0;
        this.checkpoints.forEach((cp, idx) => {
          cp.mesh.material = idx === 0 ? this.checkpointMaterials.active : this.checkpointMaterials.idle;
        });
      } else {
        const nextCheckpoint = this.checkpoints[this.activeCheckpoint];
        nextCheckpoint.mesh.material = this.checkpointMaterials.active;
        if (!this.lapStartTime) {
          this.lapStartTime = this.currentTimeMs;
        }
      }
    }
  }

  updateOffTrack() {
    if (!this.trackSamples.length) {
      this.offTrack = false;
      this.distanceFromCenter = 0;
      this.lastTrackProjection = {
        t: 0,
        distance: 0,
        closestPoint: this.car.position.clone(),
        tangent: new THREE.Vector3(0, 0, 1),
      };
      return;
    }

    const projection = this._computeTrackProjection(this.car.position);
    this.lastTrackProjection = projection;
    this.distanceFromCenter = projection.distance;
    this.offTrack = projection.distance > this.level.width * 1.15;
  }

  _computeTrackProjection(position = this.car.position) {
    if (!this.trackSamples.length) {
      return {
        t: 0,
        distance: 0,
        closestPoint: position.clone(),
        tangent: new THREE.Vector3(0, 0, 1),
      };
    }

    let bestSample = this.trackSamples[0];
    let minDistanceSq = Infinity;
    for (let i = 0; i < this.trackSamples.length; i += 1) {
      const sample = this.trackSamples[i];
      const dx = position.x - sample.point.x;
      const dz = position.z - sample.point.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDistanceSq) {
        minDistanceSq = distSq;
        bestSample = sample;
      }
    }

    let tangent;
    if (this.levelCurve && typeof this.levelCurve.getTangentAt === 'function') {
      tangent = this.levelCurve.getTangentAt(bestSample.t).clone();
    } else if (this.levelCurve && typeof this.levelCurve.getTangent === 'function') {
      tangent = this.levelCurve.getTangent(bestSample.t).clone();
    } else {
      tangent = new THREE.Vector3(0, 0, 1);
    }
    tangent.y = 0;
    if (tangent.lengthSq() === 0) {
      tangent.set(0, 0, 1);
    } else {
      tangent.normalize();
    }

    return {
      t: bestSample.t,
      distance: Math.sqrt(minDistanceSq),
      closestPoint: bestSample.point.clone(),
      tangent,
    };
  }

  updateHUD() {
    if (!this.hud.telemetry || !this.level) return;

    const now = this.lastTimestamp;
    const currentLapSeconds = this.lapStartTime ? (now - this.lapStartTime) / 1000 : 0;
    const bestLapSeconds = this.bestLapTime ? this.bestLapTime / 1000 : null;
    const lastLapSeconds = this.lastLapTime ? this.lastLapTime / 1000 : null;
    const speedKph = Math.abs(this.car.speed) * 3.6;
    const progressText = `${Math.min(this.activeCheckpoint + 1, this.checkpoints.length)} / ${
      this.checkpoints.length
    }`;

    const offTrackText = this.offTrack
      ? '<span style="color:#ff8a7a;">Off track</span>'
      : '<span style="color:#78ffd0;">On track</span>';

    const trainingSession = this.trainingSession;
    const trainingInfo = trainingSession
      ? `<div><strong>Training:</strong> ${
          trainingSession.active ? 'Active' : 'Idle'
        } · Reward ${(trainingSession.lastReward ?? 0).toFixed(3)} · Steps ${
          trainingSession.steps ?? 0
        }</div>`
      : '';

    this.hud.telemetry.innerHTML = `
      <div><strong>Track:</strong> ${this.level.name} <span style="color:#7f92ff;">(${this.level.difficulty})</span></div>
      <div><strong>Speed:</strong> ${speedKph.toFixed(1)} km/h</div>
      <div><strong>Current lap:</strong> ${currentLapSeconds.toFixed(2)} s</div>
      <div><strong>Last lap:</strong> ${lastLapSeconds ? lastLapSeconds.toFixed(2) + ' s' : '—'}</div>
      <div><strong>Best lap:</strong> ${bestLapSeconds ? bestLapSeconds.toFixed(2) + ' s' : '—'}</div>
      <div><strong>Checkpoints:</strong> ${progressText}</div>
      <div><strong>Track status:</strong> ${offTrackText}</div>
      <div><strong>Control mode:</strong> ${
        this.controlMode === 'manual' ? 'Manual (keyboard)' : 'External (AI/script)'
      }</div>
      ${trainingInfo}
    `;
  }

  _showLapFlash(lapMs) {
    if (!this.hud.flash) return;
    const seconds = lapMs / 1000;
    this.hud.flash.textContent = `Lap ${this.lapTimes.length}: ${seconds.toFixed(2)} s`;
    this.hud.flash.classList.add('visible');
    if (this.lapFlashTimeout) {
      clearTimeout(this.lapFlashTimeout);
    }
    this.lapFlashTimeout = setTimeout(() => {
      this.hud.flash.classList.remove('visible');
    }, 2200);
  }

  _updateInstructions() {
    if (!this.hud.instructions || !this.level) return;
    this.hud.instructions.innerHTML = `
      <strong>Track Intel</strong>
      <div style="margin:0.35rem 0;color:#eaf0ff;">
        ${this.level.name} · <span style="color:#8aa8ff;">${this.level.difficulty}</span>
      </div>
      <div style="margin-bottom:0.8rem;color:#aeb7cd;">${this.level.description}</div>
      <strong>Manual Driving</strong>
      <ul>
        <li><code>W</code>/<code>↑</code> accelerate, <code>S</code>/<code>↓</code> reverse</li>
        <li><code>A</code>/<code>←</code> steer left, <code>D</code>/<code>→</code> steer right</li>
        <li><code>Space</code> brake, <code>R</code> reset car</li>
        <li><code>N</code>/<code>P</code> cycle tracks, <code>C</code> toggle camera</li>
      </ul>
      <strong>AI Hooks</strong>
      <ul>
        <li>Activate scripted control via <code>window.racingSim.useExternalControls()</code>.</li>
        <li>Drive the car with <code>setControlInput({ throttle, steer, brake })</code> (range [-1, 1]).</li>
        <li>Read state snapshots from <code>window.racingSim.getState()</code> for learning loops.</li>
        <li>Switch tracks through <code>window.racingSim.loadLevel(index)</code>.</li>
        <li>Start frozen RL episodes via <code>window.racingSim.startEpisode({ levelIndex, stepDuration })</code>.</li>
        <li>Advance training with <code>stepEpisode(action)</code> to receive reward/done info per step.</li>
        <li>Inspect normalized observations with <code>getObservation()</code> and progress via <code>getTrainingState()</code>.</li>
      </ul>
    `;
  }

  updateCamera(dt) {
    if (this.cameraMode === 'overview') {
      const desired = new THREE.Vector3(this.car.position.x, 36, this.car.position.z + 0.01);
      this.camera.position.lerp(desired, 1 - Math.exp(-dt * 3));
      const lookTarget = this.car.position.clone();
      lookTarget.y += 0.5;
      this.camera.lookAt(lookTarget);
      return;
    }

    const offset = new THREE.Vector3(0, 7.5, 12);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.car.heading);
    const desiredPosition = this.car.position.clone().add(offset);
    this.camera.position.lerp(desiredPosition, 1 - Math.exp(-dt * 2.4));
    const lookAt = this.car.position.clone();
    lookAt.y += 1.5;
    this.camera.lookAt(lookAt);
  }

  update(dt, controlOverride, options = {}) {
    const { skipHUD = false, skipCamera = false } = options;
    this.currentTimeMs += dt * 1000;
    this.lastTimestamp = this.currentTimeMs;
    this.updatePhysics(dt, controlOverride);
    this.handleCheckpoints();
    this.updateOffTrack();
    if (!skipHUD) {
      this.updateHUD();
    }
    if (!skipCamera) {
      this.updateCamera(dt);
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const now = performance.now();
    const delta = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    if (!this.simulationPaused) {
      this.update(delta);
    }
    this.renderer.render(this.scene, this.camera);
  }

  getStateSnapshot() {
    const now = this.lastTimestamp;
    const bestLapSeconds = this.bestLapTime ? this.bestLapTime / 1000 : null;
    const lastLapSeconds = this.lastLapTime ? this.lastLapTime / 1000 : null;
    const currentLapSeconds = this.lapStartTime ? (now - this.lapStartTime) / 1000 : null;

    return {
      timestamp: now,
      controlMode: this.controlMode,
      level: {
        index: this.levelIndex,
        name: this.level.name,
        difficulty: this.level.difficulty,
        width: this.level.width,
        checkpointRadius: this.level.checkpointRadius,
        checkpointsRemaining: this.checkpoints.length - this.activeCheckpoint,
        totalCheckpoints: this.checkpoints.length,
      },
      car: {
        position: { x: this.car.position.x, y: this.car.position.y, z: this.car.position.z },
        heading: this.car.heading,
        speed: this.car.speed,
        steerAngle: this.car.steerAngle,
      },
      lap: {
        lapCount: this.lapTimes.length,
        currentLapSeconds,
        lastLapSeconds,
        bestLapSeconds,
      },
      telemetry: {
        offTrack: this.offTrack,
        distanceFromCenter: this.distanceFromCenter,
        speedKph: Math.abs(this.car.speed) * 3.6,
      },
    };
  }

  getObservation({ includeRaw = true, includeNormalized = true } = {}) {
    if (!this.level) {
      return { raw: null, normalized: null };
    }

    const projection =
      this.lastTrackProjection ?? this._computeTrackProjection(this.car.position);

    const headingVector = new THREE.Vector3(
      Math.sin(this.car.heading),
      0,
      Math.cos(this.car.heading)
    ).normalize();
    const tangent = projection.tangent.clone();
    const headingDot = THREE.MathUtils.clamp(
      tangent.dot(headingVector),
      -1,
      1
    );
    const headingCross = tangent.x * headingVector.z - tangent.z * headingVector.x;
    const headingError = Math.atan2(headingCross, headingDot);

    const lateralOffset = this._computeLateralOffset(projection);
    const centerScale = this.level ? this.level.width * 1.15 : 1;
    const normalizedOffset = centerScale ? lateralOffset / centerScale : 0;
    const distanceNormalized = Math.min(Math.abs(normalizedOffset), 1);

    const nextCheckpoint = this.checkpoints[this.activeCheckpoint];
    let checkpointDistance = 0;
    let checkpointDirection = new THREE.Vector3(0, 0, 1);
    let checkpointAngle = 0;
    if (nextCheckpoint) {
      checkpointDirection = nextCheckpoint.position.clone().sub(this.car.position);
      checkpointDirection.y = 0;
      checkpointDistance = checkpointDirection.length();
      if (checkpointDistance > 0) {
        checkpointDirection.normalize();
      }
      const cpDot = THREE.MathUtils.clamp(
        checkpointDirection.x * headingVector.x + checkpointDirection.z * headingVector.z,
        -1,
        1
      );
      const cpCross =
        checkpointDirection.x * headingVector.z - checkpointDirection.z * headingVector.x;
      checkpointAngle = Math.atan2(cpCross, cpDot);
    }

    const progress = projection.t;
    const progressDistance = (this.trackLength ?? 0) * progress;
    const speedAlongTrack = this.car.speed * Math.cos(headingError);
    const speedKph = Math.abs(this.car.speed) * 3.6;

    const observation = {};
    if (includeRaw) {
      observation.raw = {
        timestamp: this.lastTimestamp,
        position: { x: this.car.position.x, y: this.car.position.y, z: this.car.position.z },
        heading: this.car.heading,
        steerAngle: this.car.steerAngle,
        speed: this.car.speed,
        speedKph,
        track: {
          progress,
          progressDistance,
          tangent: { x: tangent.x, z: tangent.z },
          distanceFromCenter: this.distanceFromCenter,
          lateralOffset,
        },
        checkpoint: nextCheckpoint
          ? {
              index: nextCheckpoint.index,
              distance: checkpointDistance,
              direction: { x: checkpointDirection.x, z: checkpointDirection.z },
              relativeAngle: checkpointAngle,
            }
          : null,
        lap: {
          count: this.lapTimes.length,
          current: this.lapStartTime ? (this.lastTimestamp - this.lapStartTime) / 1000 : 0,
          best: this.bestLapTime ? this.bestLapTime / 1000 : null,
          last: this.lastLapTime ? this.lastLapTime / 1000 : null,
        },
        offTrack: this.offTrack,
      };
    }

    if (includeNormalized) {
      const checkpointScale =
        this.trackLength && this.trackLength > 0
          ? this.trackLength
          : Math.max(checkpointDistance, 1);
      observation.normalized = {
        speed: THREE.MathUtils.clamp(this.car.speed / this.params.maxSpeed, -1, 1),
        steer: THREE.MathUtils.clamp(this.car.steerAngle / this.params.maxSteer, -1, 1),
        distanceFromCenter: distanceNormalized,
        lateralPosition: THREE.MathUtils.clamp(normalizedOffset, -1.5, 1.5),
        headingToTrackSin: Math.sin(headingError),
        headingToTrackCos: Math.cos(headingError),
        checkpointDirectionSin: Math.sin(checkpointAngle),
        checkpointDirectionCos: Math.cos(checkpointAngle),
        checkpointDistance: Math.min(checkpointDistance / checkpointScale, 1),
        progress,
        offTrack: this.offTrack ? 1 : 0,
        speedAlongTrack: THREE.MathUtils.clamp(
          speedAlongTrack / this.params.maxSpeed,
          -1,
          1
        ),
      };
    }

    return observation;
  }

  pauseSimulation() {
    this.simulationPaused = true;
  }

  resumeSimulation() {
    this.simulationPaused = false;
    this.lastTime = performance.now();
  }

  isPaused() {
    return this.simulationPaused;
  }

  _mergeTrainingOptions(options = {}) {
    return {
      stepDuration:
        typeof options.stepDuration === 'number' && options.stepDuration > 0
          ? options.stepDuration
          : TRAINING_DEFAULTS.stepDuration,
      reward: {
        ...TRAINING_DEFAULTS.reward,
        ...(options.reward || {}),
      },
      termination: {
        ...TRAINING_DEFAULTS.termination,
        ...(options.termination || {}),
      },
    };
  }

  _calculateProgressDelta(current, previous) {
    let delta = current - previous;
    if (delta < -0.5) delta += 1;
    if (delta > 0.5) delta -= 1;
    return delta;
  }

  _computeLateralOffset(projection) {
    const tangent = projection.tangent.clone();
    const lateralBasis = new THREE.Vector3(-tangent.z, 0, tangent.x);
    return this.car.position.clone().sub(projection.closestPoint).dot(lateralBasis);
  }

  _normalizeAngle(angle) {
    return THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;
  }

  startTrainingEpisode(options = {}) {
    if (this.trainingSession) {
      this.trainingSession.active = false;
      this.trainingSession.done = true;
    }

    const shouldLoadLevel =
      typeof options.levelIndex === 'number' && options.levelIndex !== this.levelIndex;
    if (shouldLoadLevel) {
      this.loadLevel(options.levelIndex);
    } else {
      this.resetCar({ preserveLapTimes: false });
    }

    this.setControlMode('external');
    this.externalControl = { throttle: 0, brake: 0, steer: 0 };
    this.pauseSimulation();
    this.updateOffTrack();
    this.updateHUD();

    const mergedOptions = this._mergeTrainingOptions(options);

    this.trainingSession = {
      active: true,
      options: mergedOptions,
      steps: 0,
      cumulativeReward: 0,
      lastReward: 0,
      lastDistanceGain: 0,
      lastProgress: this.lastTrackProjection.t,
      lastCheckpointIndex: this.activeCheckpoint,
      lastLapCount: this.lapTimes.length,
      consecutiveOffTrackSteps: 0,
      stepsWithoutProgress: 0,
      lastAction: { throttle: 0, steer: 0, brake: 0 },
      startTimeMs: this.currentTimeMs,
      done: false,
      doneReasons: [],
      headless: options.headless ?? false,
    };

    return this.getObservation();
  }

  stepTrainingEpisode(action = {}, options = {}) {
    if (!this.trainingSession) {
      throw new Error('No active training episode. Call startEpisode() first.');
    }

    const session = this.trainingSession;
    if (session.done) {
      throw new Error('Training episode has finished. Start a new episode.');
    }

    const dt =
      typeof options.dt === 'number' && options.dt > 0
        ? options.dt
        : session.options.stepDuration;

    const control = this._sanitizeControlInput(action);

    const prevProgress = session.lastProgress;
    const prevCheckpointIndex = session.lastCheckpointIndex;
    const prevLapCount = session.lastLapCount;

    const skipHUD = options.skipHUD ?? session.headless;
    const shouldRender = options.render ?? !session.headless;
    const skipCamera = options.skipCamera ?? !shouldRender;

    this.update(dt, control, { skipHUD, skipCamera });

    if (shouldRender) {
      this.renderer.render(this.scene, this.camera);
    }

    const projection = this.lastTrackProjection ?? this._computeTrackProjection(this.car.position);
    const progress = projection.t;
    const progressDelta = this._calculateProgressDelta(progress, prevProgress);
    const distanceGain = progressDelta * (this.trackLength ?? 0);

    const rewardConfig = session.options.reward;
    const termination = session.options.termination;

    if (Math.abs(progressDelta) <= termination.progressThreshold) {
      session.stepsWithoutProgress += 1;
    } else {
      session.stepsWithoutProgress = 0;
    }

    if (this.offTrack) {
      session.consecutiveOffTrackSteps += 1;
    } else {
      session.consecutiveOffTrackSteps = 0;
    }

    const centerScale = this.level ? this.level.width * 1.15 : 1;
    const lateralOffset = this._computeLateralOffset(projection);
    const lateralNormalized = centerScale ? lateralOffset / centerScale : 0;
    const distancePenalty =
      Math.pow(Math.min(Math.abs(lateralNormalized), 1), 2) * rewardConfig.centerline;
    const offTrackPenalty = this.offTrack ? rewardConfig.offTrack : 0;
    const smoothnessPenalty =
      rewardConfig.smoothness *
      Math.abs(control.steer - (session.lastAction ? session.lastAction.steer : 0));
    const brakePenalty = rewardConfig.brake * control.brake;

    let reward =
      distanceGain * rewardConfig.progress -
      distancePenalty -
      offTrackPenalty -
      smoothnessPenalty -
      brakePenalty;

    const lapCompleted = this.lapTimes.length > prevLapCount;
    const checkpointAdvanced =
      lapCompleted || this.activeCheckpoint !== prevCheckpointIndex;

    if (checkpointAdvanced) {
      reward += rewardConfig.checkpointBonus;
    }
    if (lapCompleted) {
      reward += rewardConfig.lapBonus;
    }

    session.cumulativeReward += reward;
    session.steps += 1;
    session.lastReward = reward;
    session.lastDistanceGain = distanceGain;
    session.lastAction = control;
    session.lastProgress = progress;
    session.lastCheckpointIndex = this.activeCheckpoint;
    session.lastLapCount = this.lapTimes.length;

    const doneReasons = [];
    if (session.steps >= termination.maxSteps) doneReasons.push('max_steps');
    if (session.consecutiveOffTrackSteps >= termination.offTrackSteps)
      doneReasons.push('off_track_timeout');
    if (session.stepsWithoutProgress >= termination.noProgressSteps)
      doneReasons.push('stalled');

    const done = doneReasons.length > 0;
    session.done = done;
    session.doneReasons = doneReasons;
    session.active = !done;

    if (done && options.autoReset) {
      this.resetCar({ preserveLapTimes: false });
      this.updateOffTrack();
      this.pauseSimulation();
    }

    const observation = options.returnObservation === false ? null : this.getObservation();

    const info = {
      checkpointAdvanced,
      lapCompleted,
      offTrack: this.offTrack,
      distanceFromCenter: this.distanceFromCenter,
      distanceGain,
      progress,
      cumulativeReward: session.cumulativeReward,
      steps: session.steps,
      elapsedTime: (this.currentTimeMs - session.startTimeMs) / 1000,
      doneReasons,
      speed: this.car.speed,
    };

    return { observation, reward, done, info };
  }

  endTrainingEpisode(options = {}) {
    if (!this.trainingSession) {
      if (options.resume === true) {
        this.resumeSimulation();
      }
      return null;
    }

    const session = this.trainingSession;
    const summary = {
      steps: session.steps,
      cumulativeReward: session.cumulativeReward,
      elapsedTime: (this.currentTimeMs - session.startTimeMs) / 1000,
      done: session.done,
      doneReasons: [...(session.doneReasons || [])],
    };

    session.active = false;
    if (options.resume === true) {
      this.resumeSimulation();
    }

    this.trainingSession = null;
    this.updateHUD();

    return summary;
  }

  getTrainingState() {
    if (!this.trainingSession) return null;
    const session = this.trainingSession;
    return {
      active: session.active,
      steps: session.steps,
      cumulativeReward: session.cumulativeReward,
      lastReward: session.lastReward,
      lastDistanceGain: session.lastDistanceGain,
      options: session.options,
      elapsedTime: (this.currentTimeMs - session.startTimeMs) / 1000,
      done: session.done,
      doneReasons: session.doneReasons,
      headless: session.headless,
    };
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

const racingLab = new RacingLab();

window.racingSim = {
  loadLevel: (index) => racingLab.loadLevel(index),
  reset: () => racingLab.resetCar({ preserveLapTimes: true }),
  getState: () => racingLab.getStateSnapshot(),
  getObservation: (options) => racingLab.getObservation(options),
  setControlInput: (control) => racingLab.setExternalControl(control),
  useExternalControls: () => racingLab.setControlMode('external'),
  useManualControls: () => racingLab.setControlMode('manual'),
  setCameraMode: (mode) => racingLab.setCameraMode(mode),
  toggleCameraMode: () => racingLab.toggleCameraMode(),
  pause: () => racingLab.pauseSimulation(),
  resume: () => racingLab.resumeSimulation(),
  isPaused: () => racingLab.isPaused(),
  startEpisode: (options) => racingLab.startTrainingEpisode(options),
  stepEpisode: (action, options) => racingLab.stepTrainingEpisode(action, options),
  endEpisode: (options) => racingLab.endTrainingEpisode(options),
  getTrainingState: () => racingLab.getTrainingState(),
  getTrainingDefaults: () => JSON.parse(JSON.stringify(TRAINING_DEFAULTS)),
  getLevels: () =>
    TRACK_LEVELS.map((level, index) => ({
      index,
      name: level.name,
      difficulty: level.difficulty,
      description: level.description,
    })),
};

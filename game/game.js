(() => {
  if (typeof THREE === 'undefined') {
    console.error('Three.js must be loaded before game.js');
    return;
  }

  const canvas = document.getElementById('gameCanvas');
  if (!canvas) {
    console.error('Missing #gameCanvas element');
    return;
  }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070e);

  const hemiLight = new THREE.HemisphereLight(0x6ea9ff, 0x0b101f, 0.55);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff4de, 0.95);
  keyLight.position.set(6, 9, 5);
  keyLight.castShadow = false;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x7bc4ff, 0.35);
  fillLight.position.set(-4, 6, -7);
  scene.add(fillLight);

  const arenaRadius = 16;

  const arenaMaterial = new THREE.MeshStandardMaterial({
    color: 0x101b32,
    roughness: 0.85,
    metalness: 0.05,
  });
  const arena = new THREE.Mesh(new THREE.CylinderGeometry(arenaRadius, arenaRadius, 0.6, 64), arenaMaterial);
  arena.receiveShadow = true;
  arena.position.y = -0.3;
  scene.add(arena);

  const platformMaterial = new THREE.MeshStandardMaterial({
    color: 0x16274a,
    roughness: 0.6,
    metalness: 0.35,
    emissive: 0x0a1326,
    emissiveIntensity: 0.35,
  });
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(arenaRadius * 0.96, arenaRadius * 0.96, 0.1, 64), platformMaterial);
  platform.receiveShadow = true;
  platform.position.y = 0;
  scene.add(platform);

  const gridHelper = new THREE.GridHelper(arenaRadius * 1.8, 24, 0x3b74bf, 0x1c2c4b);
  gridHelper.position.y = 0.051;
  scene.add(gridHelper);

  const rimGeometry = new THREE.TorusGeometry(arenaRadius * 1.02, 0.12, 16, 64);
  const rimMaterial = new THREE.MeshBasicMaterial({ color: 0x1f88ff, opacity: 0.6, transparent: true });
  const rim = new THREE.Mesh(rimGeometry, rimMaterial);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.05;
  scene.add(rim);

  const playerMaterial = new THREE.MeshStandardMaterial({
    color: 0x47c4ff,
    emissive: 0x134b7c,
    metalness: 0.45,
    roughness: 0.3,
  });
  const player = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), playerMaterial);
  player.position.set(0, 0.45, 0);
  scene.add(player);

  const trailRing = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.75, 32),
    new THREE.MeshBasicMaterial({ color: 0x2fbfff, opacity: 0.7, transparent: true })
  );
  trailRing.rotation.x = -Math.PI / 2;
  trailRing.position.y = 0.02;
  scene.add(trailRing);

  const columnMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a2745,
    metalness: 0.2,
    roughness: 0.6,
  });
  const pillarPositions = [
    new THREE.Vector3(7, 0, 7),
    new THREE.Vector3(-7, 0, 7),
    new THREE.Vector3(-7, 0, -7),
    new THREE.Vector3(7, 0, -7),
  ];
  pillarPositions.forEach((pos) => {
    const height = 2.6 + Math.random() * 1.2;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, height, 24), columnMaterial);
    pillar.position.set(pos.x, height / 2, pos.z);
    scene.add(pillar);
  });

  const aspect = window.innerWidth / window.innerHeight;

  const chaseCamera = new THREE.PerspectiveCamera(60, aspect, 0.1, 100);
  chaseCamera.position.set(6, 5.5, 6.5);
  chaseCamera.lookAt(player.position);

  const orthoSize = 12;
  const orthoCamera = new THREE.OrthographicCamera(
    (-orthoSize * aspect) / 2,
    (orthoSize * aspect) / 2,
    orthoSize / 2,
    -orthoSize / 2,
    0.1,
    100
  );
  orthoCamera.position.set(0, 20, 0);
  orthoCamera.lookAt(player.position);
  orthoCamera.up.set(0, 0, -1);

  let activeCamera = chaseCamera;
  let cameraMode = 'chase';

  const clock = new THREE.Clock();
  let elapsedTime = 0;

  const keys = new Map();

  const velocity = new THREE.Vector3();
  const scratch = new THREE.Vector3();

  const timeEl = document.getElementById('timeValue');
  const scoreEl = document.getElementById('scoreValue');
  const totalEl = document.getElementById('totalValue');
  const viewEl = document.getElementById('viewLabel');
  const messageEl = document.getElementById('message');

  const collectiblesGroup = new THREE.Group();
  scene.add(collectiblesGroup);
  let collectibles = [];

  const collectibleGeometry = new THREE.OctahedronGeometry(0.35);
  const baseCollectibleMaterial = new THREE.MeshStandardMaterial({
    color: 0xffc857,
    emissive: 0x663300,
    emissiveIntensity: 0.75,
    roughness: 0.4,
    metalness: 0.3,
  });

  function createCollectible() {
    const material = baseCollectibleMaterial.clone();
    material.color.offsetHSL(Math.random() * 0.08 - 0.04, 0, Math.random() * 0.1 - 0.05);
    const mesh = new THREE.Mesh(collectibleGeometry, material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData = {
      collected: false,
      phase: Math.random() * Math.PI * 2,
    };
    return mesh;
  }

  function randomPoint() {
    const radius = arenaRadius * 0.75;
    let x = 0;
    let z = 0;
    let attempts = 0;
    do {
      const angle = Math.random() * Math.PI * 2;
      const r = 2.5 + Math.random() * (radius - 2.5);
      x = Math.cos(angle) * r;
      z = Math.sin(angle) * r;
      attempts += 1;
    } while (scratch.set(x, 0, z).distanceToSquared(player.position) < 4 && attempts < 8);
    return { x, z };
  }

  function scatterCollectibles(count = 8) {
    collectibles.forEach((c) => collectiblesGroup.remove(c.mesh));
    collectibles = [];
    for (let i = 0; i < count; i += 1) {
      const mesh = createCollectible();
      const { x, z } = randomPoint();
      mesh.position.set(x, 0.45, z);
      collectiblesGroup.add(mesh);
      collectibles.push({ mesh, collected: false });
    }
    totalEl.textContent = String(collectibles.length);
    scoreEl.textContent = '0';
    messageEl.textContent = '';
  }

  function setCameraMode(mode) {
    const next = mode === 'auto' ? (cameraMode === 'chase' ? 'orthographic' : 'chase') : mode;
    if (next === cameraMode) return;
    cameraMode = next;
    activeCamera = cameraMode === 'chase' ? chaseCamera : orthoCamera;
    viewEl.textContent = cameraMode === 'chase' ? 'Chase' : 'Top-down';
  }

  function handleKeyDown(event) {
    keys.set(event.code, true);
    if (event.code === 'KeyV') {
      setCameraMode('auto');
    } else if (event.code === 'KeyR') {
      resetGame();
    }
  }

  function handleKeyUp(event) {
    keys.set(event.code, false);
  }

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);

  function clampToArena(position) {
    const distance = Math.sqrt(position.x * position.x + position.z * position.z);
    if (distance > arenaRadius * 0.94) {
      const scale = (arenaRadius * 0.94) / distance;
      position.x *= scale;
      position.z *= scale;
      velocity.x *= 0.3;
      velocity.z *= 0.3;
    }
  }

  function updatePlayer(dt) {
    scratch.set(
      (keys.get('KeyD') || keys.get('ArrowRight') ? 1 : 0) - (keys.get('KeyA') || keys.get('ArrowLeft') ? 1 : 0),
      0,
      (keys.get('KeyS') || keys.get('ArrowDown') ? 1 : 0) - (keys.get('KeyW') || keys.get('ArrowUp') ? 1 : 0)
    );

    if (scratch.lengthSq() > 0) {
      scratch.normalize();
    }

    const boost = keys.get('ShiftLeft') || keys.get('ShiftRight') ? 1.6 : 1;
    const acceleration = 9 * boost;
    velocity.x += scratch.x * acceleration * dt;
    velocity.z += scratch.z * acceleration * dt;

    const baseDamping = scratch.lengthSq() > 0 ? 3.8 : 6.2;
    const brakeDamping = keys.get('Space') ? 18 : 0;
    const damping = Math.max(0, 1 - Math.min(0.98, (baseDamping + brakeDamping) * dt));
    velocity.multiplyScalar(damping);

    player.position.addScaledVector(velocity, dt);
    clampToArena(player.position);

    trailRing.position.set(player.position.x, 0.02, player.position.z);

    if (velocity.lengthSq() > 0.001) {
      player.rotation.y = Math.atan2(velocity.x, velocity.z);
    }
  }

  function updateCollectibles(dt, time) {
    let collectedCount = 0;
    collectibles.forEach((item) => {
      const mesh = item.mesh;
      if (!item.collected) {
        const distanceSq = mesh.position.distanceToSquared(player.position);
        if (distanceSq < 0.8) {
          item.collected = true;
          mesh.visible = false;
          scoreEl.textContent = String(Number(scoreEl.textContent) + 1);
        }
      }

      if (item.collected) {
        collectedCount += 1;
        mesh.rotation.y += dt * 2.5;
      } else {
        mesh.position.y = 0.45 + Math.sin(time * 2 + mesh.userData.phase) * 0.12;
        mesh.rotation.y += dt * 1.5;
      }
    });

    if (collectibles.length > 0 && collectedCount === collectibles.length) {
      messageEl.textContent = 'All shards collected! Press R to respawn.';
    }
  }

  const chaseOffset = new THREE.Vector3(0, 3.4, 6.2);
  const lookOffset = new THREE.Vector3(0, 1.1, 0);

  function updateCamera(dt) {
    if (cameraMode === 'chase') {
      const rotation = player.rotation.y;
      const rotatedOffset = new THREE.Vector3(
        chaseOffset.x * Math.sin(rotation) + chaseOffset.z * Math.cos(rotation),
        chaseOffset.y,
        chaseOffset.z * Math.cos(rotation) - chaseOffset.x * Math.sin(rotation)
      );
      const desiredPosition = player.position.clone().add(rotatedOffset);
      chaseCamera.position.lerp(desiredPosition, 1 - Math.exp(-dt * 4.5));
      const target = player.position.clone().add(lookOffset);
      chaseCamera.lookAt(target);
    } else {
      orthoCamera.position.x = player.position.x;
      orthoCamera.position.z = player.position.z;
      orthoCamera.lookAt(player.position.x, player.position.y, player.position.z);
    }
  }

  function updateHUD(dt) {
    elapsedTime += dt;
    if (timeEl) {
      timeEl.textContent = elapsedTime.toFixed(1);
    }
  }

  function onResize() {
    const newAspect = window.innerWidth / window.innerHeight;
    renderer.setSize(window.innerWidth, window.innerHeight);
    chaseCamera.aspect = newAspect;
    chaseCamera.updateProjectionMatrix();

    orthoCamera.left = (-orthoSize * newAspect) / 2;
    orthoCamera.right = (orthoSize * newAspect) / 2;
    orthoCamera.updateProjectionMatrix();
  }

  window.addEventListener('resize', onResize);

  function resetGame() {
    player.position.set(0, 0.45, 0);
    velocity.set(0, 0, 0);
    elapsedTime = 0;
    scatterCollectibles(9);
    viewEl.textContent = cameraMode === 'chase' ? 'Chase' : 'Top-down';
  }

  scatterCollectibles(9);
  viewEl.textContent = 'Chase';
  if (totalEl) totalEl.textContent = String(collectibles.length);
  if (scoreEl) scoreEl.textContent = '0';

  function animate() {
    const dt = clock.getDelta();
    const time = clock.elapsedTime;

    updatePlayer(dt);
    updateCollectibles(dt, time);
    updateCamera(dt);
    updateHUD(dt);

    renderer.render(scene, activeCamera);
  }

  renderer.setAnimationLoop(animate);

  const api = {
    getState() {
      return {
        position: { x: player.position.x, y: player.position.y, z: player.position.z },
        velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
        collected: Number(scoreEl ? scoreEl.textContent : 0),
        total: collectibles.length,
        elapsedTime,
        view: cameraMode,
      };
    },
    reset() {
      resetGame();
    },
    toggleView(mode = 'auto') {
      if (mode === 'chase' || mode === 'orthographic') {
        setCameraMode(mode);
      } else {
        setCameraMode('auto');
      }
    },
    spawnCollectibles(count = 9) {
      scatterCollectibles(Math.max(1, Math.floor(count)));
    },
  };

  window.playgroundSim = api;
})();

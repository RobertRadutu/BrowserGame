import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';

import {FBXLoader} from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/FBXLoader.js';
import {GLTFLoader} from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/GLTFLoader.js';
import {Actors} from './Actors.js';

class BasicCharacterControllerProxy {
  constructor(animations) {
    this._animations = animations;
  }

  get animations() {
    return this._animations;
  }
};


class BasicCharacterController {
  constructor(params) {
    this._Init(params);
  }

  _Init(params) {
    this._params = params;
    this._decceleration = new THREE.Vector3(-0.0005, -0.0001, -5.0);
    this._acceleration = new THREE.Vector3(1, 0.25, 50.0);
    this._velocity = new THREE.Vector3(0, 0, 0);
    this._position = new THREE.Vector3();

    this._animations = {};
    this._input = new BasicCharacterControllerInput();
    this._stateMachine = new CharacterFSM(
        new BasicCharacterControllerProxy(this._animations));

    this._LoadModels();
  }

  _LoadModels() {
    const loader = new FBXLoader();
    loader.setPath('./resources/zombie/');
    loader.load('mremireh_o_desbiens.fbx', (fbx) => {
      fbx.scale.setScalar(0.1);
      fbx.traverse(c => {
        c.castShadow = true;
      });

      this._target = fbx;
      this._params.scene.add(this._target);

      this._mixer = new THREE.AnimationMixer(this._target);

      this._manager = new THREE.LoadingManager();
      this._manager.onLoad = () => {
        this._stateMachine.SetState('idle');
      };

      const _OnLoad = (animName, anim) => {
        const clip = anim.animations[0];
        const action = this._mixer.clipAction(clip);
  
        this._animations[animName] = {
          clip: clip,
          action: action,
        };
      };

      const loader = new FBXLoader(this._manager);
      loader.setPath('./resources/zombie/');
      loader.load('walk.fbx', (a) => { _OnLoad('walk', a); });
      loader.load('run.fbx', (a) => { _OnLoad('run', a); });
      loader.load('idle.fbx', (a) => { _OnLoad('idle', a); });
      loader.load('dance.fbx', (a) => { _OnLoad('dance', a); });
    });
  }

  get Position() {
    return this._position;
  }

  get Rotation() {
    if (!this._target) {
      return new THREE.Quaternion();
    }
    return this._target.quaternion;
  }

  Update(timeInSeconds) {
    if (!this._stateMachine._currentState) {
      return;
    }

    this._stateMachine.Update(timeInSeconds, this._input);

    const velocity = this._velocity;
    const frameDecceleration = new THREE.Vector3(
        velocity.x * this._decceleration.x,
        velocity.y * this._decceleration.y,
        velocity.z * this._decceleration.z
    );
    frameDecceleration.multiplyScalar(timeInSeconds);
    frameDecceleration.z = Math.sign(frameDecceleration.z) * Math.min(
        Math.abs(frameDecceleration.z), Math.abs(velocity.z));

    velocity.add(frameDecceleration);

    const controlObject = this._target;
    const _Q = new THREE.Quaternion();
    const _A = new THREE.Vector3();
    const _R = controlObject.quaternion.clone();

    const acc = this._acceleration.clone();
    if (this._input._keys.shift) {
      acc.multiplyScalar(2.0);
    }

    if (this._stateMachine._currentState.Name == 'dance') {
      acc.multiplyScalar(0.0);
    }

    if (this._input._keys.forward) {
      velocity.z += acc.z * timeInSeconds;
    }
    if (this._input._keys.backward) {
      velocity.z -= acc.z * timeInSeconds;
    }
    if (this._input._keys.left) {
      _A.set(0, 1, 0);
      _Q.setFromAxisAngle(_A, 4.0 * Math.PI * timeInSeconds * this._acceleration.y);
      _R.multiply(_Q);
    }
    if (this._input._keys.right) {
      _A.set(0, 1, 0);
      _Q.setFromAxisAngle(_A, 4.0 * -Math.PI * timeInSeconds * this._acceleration.y);
      _R.multiply(_Q);
    }

    controlObject.quaternion.copy(_R);

    const oldPosition = new THREE.Vector3();
    oldPosition.copy(controlObject.position);

    const forward = new THREE.Vector3(0, 0, 1);
    forward.applyQuaternion(controlObject.quaternion);
    forward.normalize();

    const sideways = new THREE.Vector3(1, 0, 0);
    sideways.applyQuaternion(controlObject.quaternion);
    sideways.normalize();

    sideways.multiplyScalar(velocity.x * timeInSeconds);
    forward.multiplyScalar(velocity.z * timeInSeconds);

    controlObject.position.add(forward);
    controlObject.position.add(sideways);

    this._position.copy(controlObject.position);

    if (this._mixer) {
      this._mixer.update(timeInSeconds);
    }
  }
};

class BasicCharacterControllerInput {
  constructor() {
    this._Init();    
  }

  _Init() {
    this._keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      space: false,
      shift: false,
    };
    document.addEventListener('keydown', (e) => this._onKeyDown(e), false);
    document.addEventListener('keyup', (e) => this._onKeyUp(e), false);
  }

  _onKeyDown(event) {
    switch (event.keyCode) {
      case 87: // w
        this._keys.forward = true;
        break;
      case 65: // a
        this._keys.left = true;
        break;
      case 83: // s
        this._keys.backward = true;
        break;
      case 68: // d
        this._keys.right = true;
        break;
      case 32: // SPACE
        this._keys.space = true;
        break;
      case 16: // SHIFT
        this._keys.shift = true;
        break;
    }
  }

  _onKeyUp(event) {
    switch(event.keyCode) {
      case 87: // w
        this._keys.forward = false;
        break;
      case 65: // a
        this._keys.left = false;
        break;
      case 83: // s
        this._keys.backward = false;
        break;
      case 68: // d
        this._keys.right = false;
        break;
      case 32: // SPACE
        this._keys.space = false;
        break;
      case 16: // SHIFT
        this._keys.shift = false;
        break;
    }
  }
};


class FiniteStateMachine {
  constructor() {
    this._states = {};
    this._currentState = null;
  }

  _AddState(name, type) {
    this._states[name] = type;
  }

  SetState(name) {
    const prevState = this._currentState;
    
    if (prevState) {
      if (prevState.Name == name) {
        return;
      }
      prevState.Exit();
    }

    const state = new this._states[name](this);

    this._currentState = state;
    state.Enter(prevState);
  }

  Update(timeElapsed, input) {
    if (this._currentState) {
      this._currentState.Update(timeElapsed, input);
    }
  }
};


class CharacterFSM extends FiniteStateMachine {
  constructor(proxy) {
    super();
    this._proxy = proxy;
    this._Init();
  }

  _Init() {
    this._AddState('idle', IdleState);
    this._AddState('walk', WalkState);
    this._AddState('run', RunState);
    this._AddState('dance', DanceState);
  }
};


class State {
  constructor(parent) {
    this._parent = parent;
  }

  Enter() {}
  Exit() {}
  Update() {}
};


class DanceState extends State {
  constructor(parent) {
    super(parent);

    this._FinishedCallback = () => {
      this._Finished();
    }
  }

  get Name() {
    return 'dance';
  }

  Enter(prevState) {
    const curAction = this._parent._proxy._animations['dance'].action;
    const mixer = curAction.getMixer();
    mixer.addEventListener('finished', this._FinishedCallback);

    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;

      curAction.reset();  
      curAction.setLoop(THREE.LoopOnce, 1);
      curAction.clampWhenFinished = true;
      curAction.crossFadeFrom(prevAction, 0.2, true);
      curAction.play();
    } else {
      curAction.play();
    }
  }

  _Finished() {
    this._Cleanup();
    this._parent.SetState('idle');
  }

  _Cleanup() {
    const action = this._parent._proxy._animations['dance'].action;
    
    action.getMixer().removeEventListener('finished', this._CleanupCallback);
  }

  Exit() {
    this._Cleanup();
  }

  Update(_) {
  }
};


class WalkState extends State {
  constructor(parent) {
    super(parent);
  }

  get Name() {
    return 'walk';
  }

  Enter(prevState) {
    const curAction = this._parent._proxy._animations['walk'].action;
    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;

      curAction.enabled = true;

      if (prevState.Name == 'run') {
        const ratio = curAction.getClip().duration / prevAction.getClip().duration;
        curAction.time = prevAction.time * ratio;
      } else {
        curAction.time = 0.0;
        curAction.setEffectiveTimeScale(1.0);
        curAction.setEffectiveWeight(1.0);
      }

      curAction.crossFadeFrom(prevAction, 0.5, true);
      curAction.play();
    } else {
      curAction.play();
    }
  }

  Exit() {
  }

  Update(timeElapsed, input) {
    if (input._keys.forward || input._keys.backward) {
      if (input._keys.shift) {
        this._parent.SetState('run');
      }
      return;
    }

    this._parent.SetState('idle');
  }
};


class RunState extends State {
  constructor(parent) {
    super(parent);
  }

  get Name() {
    return 'run';
  }

  Enter(prevState) {
    const curAction = this._parent._proxy._animations['run'].action;
    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;

      curAction.enabled = true;

      if (prevState.Name == 'walk') {
        const ratio = curAction.getClip().duration / prevAction.getClip().duration;
        curAction.time = prevAction.time * ratio;
      } else {
        curAction.time = 0.0;
        curAction.setEffectiveTimeScale(1.0);
        curAction.setEffectiveWeight(1.0);
      }

      curAction.crossFadeFrom(prevAction, 0.5, true);
      curAction.play();
    } else {
      curAction.play();
    }
  }

  Exit() {
  }

  Update(timeElapsed, input) {
    if (input._keys.forward || input._keys.backward) {
      if (!input._keys.shift) {
        this._parent.SetState('walk');
      }
      return;
    }

    this._parent.SetState('idle');
  }
};


class IdleState extends State {
  constructor(parent) {
    super(parent);
  }

  get Name() {
    return 'idle';
  }

  Enter(prevState) {
    const idleAction = this._parent._proxy._animations['idle'].action;
    if (prevState) {
      const prevAction = this._parent._proxy._animations[prevState.Name].action;
      idleAction.time = 0.0;
      idleAction.enabled = true;
      idleAction.setEffectiveTimeScale(1.0);
      idleAction.setEffectiveWeight(1.0);
      idleAction.crossFadeFrom(prevAction, 0.5, true);
      idleAction.play();
    } else {
      idleAction.play();
    }
  }

  Exit() {
  }

  Update(_, input) {
    if (input._keys.forward || input._keys.backward) {
      this._parent.SetState('walk');
    } else if (input._keys.space) {
      this._parent.SetState('dance');
    }
  }
};


class ThirdPersonCamera {
  constructor(params) {
    this._params = params;
    this._camera = params.camera;

    this._currentPosition = new THREE.Vector3();
    this._currentLookat = new THREE.Vector3();
  }

  _CalculateIdealOffset() {
    const idealOffset = new THREE.Vector3(-15, 20, -30);
    idealOffset.applyQuaternion(this._params.target.Rotation);
    idealOffset.add(this._params.target.Position);
    return idealOffset;
  }

  _CalculateIdealLookat() {
    const idealLookat = new THREE.Vector3(0, 10, 50);
    idealLookat.applyQuaternion(this._params.target.Rotation);
    idealLookat.add(this._params.target.Position);
    return idealLookat;
  }

  Update(timeElapsed) {
    const idealOffset = this._CalculateIdealOffset();
    const idealLookat = this._CalculateIdealLookat();

    // const t = 0.05;
    // const t = 4.0 * timeElapsed;
    const t = 1.0 - Math.pow(0.001, timeElapsed);

    this._currentPosition.lerp(idealOffset, t);
    this._currentLookat.lerp(idealLookat, t);

    this._camera.position.copy(this._currentPosition);
    this._camera.lookAt(this._currentLookat);
  }
}

class Pos{
  constructor(x, y ,z){
    this.x = x;
    this.y = y;
    this.z = z;
  }
}


class Core{
  constructor() {
    this._Initialize();
  }

  _Initialize() {
    this._threejs = new THREE.WebGLRenderer({
      antialias: true,
    });
    this._threejs.outputEncoding = THREE.sRGBEncoding;
    this._threejs.shadowMap.enabled = true;
    this._threejs.shadowMap.type = THREE.PCFSoftShadowMap;
    this._threejs.setPixelRatio(window.devicePixelRatio);
    this._threejs.setSize(window.innerWidth, window.innerHeight);

    document.body.appendChild(this._threejs.domElement);

    window.addEventListener('resize', () => {
      this._OnWindowResize();
    }, false);

    const fov = 60;
    const aspect = 1920 / 1080;
    const near = 1.0;
    const far = 5000.0;
    this._camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    this._camera.position.set(25, 10, 25);

    this._scene = new THREE.Scene();

    let light = new THREE.DirectionalLight(0xFFFFFF, 1.0);
    light.position.set(-100, 100, 100);
    light.target.position.set(0, 0, 0);
    light.castShadow = true;
    light.shadow.bias = -0.001;
    light.shadow.mapSize.width = 8192;
    light.shadow.mapSize.height = 8192;
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 1000.0;
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 1000.0;
    light.shadow.camera.left = 100;
    light.shadow.camera.right = -100;
    light.shadow.camera.top = 100;
    light.shadow.camera.bottom = -100;
    this._scene.add(light);

    light = new THREE.AmbientLight(0xFFFFFF, 0.25);
    this._scene.add(light);

    const loader = new THREE.CubeTextureLoader();
    const texture = loader.load([
        './resources/posx.jpg',
        './resources/negx.jpg',
        './resources/posy.jpg',
        './resources/negy.jpg',
        './resources/posz.jpg',
        './resources/negz.jpg',
    ]);

    texture.encoding = THREE.sRGBEncoding;
    this._scene.background = texture;

    const groundTexture = new THREE.TextureLoader().load('./resources/dirt.jpg');
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x808080,
    });
    groundMaterial.map = groundTexture;
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(1000, 1000, 10, 10),
        groundMaterial
    );
    plane.castShadow = false;
    plane.receiveShadow = true;
    plane.rotation.x = -Math.PI / 2;
    this._scene.add(plane);

    const gltfLoader = new GLTFLoader();
    gltfLoader.load('./assets/house1/scene.gltf', (gltfScene) =>{
      gltfScene.scene.position.x = 100;
      gltfScene.scene.position.y = -20;
      gltfScene.scene.position.z = -500;
      gltfScene.scene.scale.set(15, 15, 15);
      this._scene.add(gltfScene.scene);
    });

    gltfLoader.load('./assets/house1/scene.gltf', (gltfScene) =>{
      gltfScene.scene.position.x = -100;
      gltfScene.scene.position.y = -20;
      gltfScene.scene.position.z = -500;
      gltfScene.scene.scale.set(15, 15, 15);
      this._scene.add(gltfScene.scene);
    });

    gltfLoader.load('./assets/house2/scene.gltf', (gltfScene) =>{
      gltfScene.scene.position.x = -500;
      gltfScene.scene.position.y = 55.5;
      gltfScene.scene.position.z = -200;
      gltfScene.scene.scale.set(300, 300, 300);
      this._scene.add(gltfScene.scene);
    });

    gltfLoader.load('./assets/house2/scene.gltf', (gltfScene) =>{
      gltfScene.scene.position.x = -500;
      gltfScene.scene.position.y = 55.5;
      gltfScene.scene.position.z = 200;
      gltfScene.scene.scale.set(300, 300, 300);
      this._scene.add(gltfScene.scene);
    });

    gltfLoader.load('./assets/house3/scene.gltf', (gltfScene) =>{
      gltfScene.scene.position.x = -500;
      gltfScene.scene.position.y = 0;
      gltfScene.scene.position.z = -200;
      gltfScene.scene.scale.set(50, 50, 50);
      this._scene.add(gltfScene.scene);
    });

    gltfLoader.load('./assets/house3/scene.gltf', (gltfScene) =>{
      gltfScene.scene.position.x = 500;
      gltfScene.scene.position.y = 0;
      gltfScene.scene.position.z = -200;
      gltfScene.scene.scale.set(50, 50, 50);
      this._scene.add(gltfScene.scene);
    });

    gltfLoader.load('./assets/rose_tree/scene.gltf', (gltfScene) =>{
      gltfScene.scene.position.x = -250;
      gltfScene.scene.position.y = 0;
      gltfScene.scene.position.z = 20;
      gltfScene.scene.rotation.y = -80;
      gltfScene.scene.scale.set(0.2, 0.2, 0.2);
      this._scene.add(gltfScene.scene);
    });

    gltfLoader.load('./assets/rose_tree/scene.gltf', (gltfScene) =>{
      gltfScene.scene.position.x = -250;
      gltfScene.scene.position.y = 0;
      gltfScene.scene.position.z = -90;
      gltfScene.scene.rotation.y = -80;
      gltfScene.scene.scale.set(0.2, 0.2, 0.2);
      this._scene.add(gltfScene.scene);
    });

    gltfLoader.load('./assets/rose_tree/scene.gltf', (gltfScene) =>{
      gltfScene.scene.position.x = -250;
      gltfScene.scene.position.y = 0;
      gltfScene.scene.position.z = -380;
      gltfScene.scene.rotation.y = -80;
      gltfScene.scene.scale.set(0.2, 0.2, 0.2);
      this._scene.add(gltfScene.scene);
    });

    gltfLoader.load('./assets/rose_tree/scene.gltf', (gltfScene) =>{
      gltfScene.scene.position.x = -250;
      gltfScene.scene.position.y = 0;
      gltfScene.scene.position.z = 300;
      gltfScene.scene.rotation.y = -80;
      gltfScene.scene.scale.set(0.2, 0.2, 0.2);
      this._scene.add(gltfScene.scene);
    });

    gltfLoader.load('./assets/tree_man/scene.gltf', (gltfScene) =>{
      gltfScene.scene.position.x = -250;
      gltfScene.scene.position.y = 30;
      gltfScene.scene.position.z = -45;
      gltfScene.scene.rotation.y = -80;
      gltfScene.scene.scale.set(30, 30, 30);
      this._scene.add(gltfScene.scene);
    });

    gltfLoader.load('./assets/monster_garden/scene.gltf', (gltfScene) =>{
      gltfScene.scene.position.x = 0;
      gltfScene.scene.position.y = 50;
      gltfScene.scene.position.z = 0;
      gltfScene.scene.rotation.y = 0;
      gltfScene.scene.scale.set(100, 100, 100);
      this._scene.add(gltfScene.scene);
    });

    gltfLoader.load('./assets/medieval_tower/scene.gltf', (gltfScene) =>{
      gltfScene.scene.position.x = 500;
      gltfScene.scene.position.y = 0;
      gltfScene.scene.position.z = 0;
      gltfScene.scene.rotation.y = 80;
      gltfScene.scene.scale.set(0.12, 0.12, 0.12);
      this._scene.add(gltfScene.scene);
    });

    gltfLoader.load('./assets/medieval_tower/scene.gltf', (gltfScene) =>{
      gltfScene.scene.position.x = 500;
      gltfScene.scene.position.y = 0;
      gltfScene.scene.position.z = -100;
      gltfScene.scene.rotation.y = 80;
      gltfScene.scene.scale.set(0.12, 0.12, 0.12);
      this._scene.add(gltfScene.scene);
    });

    gltfLoader.load('./assets/kokura_castle/scene.gltf', (gltfScene) =>{
      gltfScene.scene.position.x = -500;
      gltfScene.scene.position.y = -190;
      gltfScene.scene.position.z = 350;
      gltfScene.scene.rotation.y = 80;
      gltfScene.scene.scale.set(7, 7, 7);
      this._scene.add(gltfScene.scene);
    });

    gltfLoader.load('./assets/camp_fire/scene.gltf', (gltfScene) =>{
      gltfScene.scene.position.x = 0;
      gltfScene.scene.position.y = 0;
      gltfScene.scene.position.z = 50;
      gltfScene.scene.scale.set(0.2, 0.2, 0.2);
      this._scene.add(gltfScene.scene);
    });

    gltfLoader.load('./assets/bench/scene.gltf', (gltfScene) =>{
      gltfScene.scene.position.x = 0;
      gltfScene.scene.position.y = 0;
      gltfScene.scene.position.z = 70;
      gltfScene.scene.rotation.y = 80;
      gltfScene.scene.scale.set(0.15, 0.15, 0.15);
      this._scene.add(gltfScene.scene);
    });

    gltfLoader.load('./assets/bench/scene.gltf', (gltfScene) =>{
      gltfScene.scene.position.x = 0;
      gltfScene.scene.position.y = 0;
      gltfScene.scene.position.z = 20;
      gltfScene.scene.rotation.y = 80;
      gltfScene.scene.scale.set(0.15, 0.15, 0.15);
      this._scene.add(gltfScene.scene);
    });

    gltfLoader.load('./assets/house_model/scene.gltf', (gltfScene) =>{
      gltfScene.scene.position.x = 500;
      gltfScene.scene.position.y = -25 ;
      gltfScene.scene.position.z = 250;
      gltfScene.scene.rotation.y = 80;
      gltfScene.scene.scale.set(10, 10, 10);
      this._scene.add(gltfScene.scene);
    });
  
  



    this._mixers = [];
    this._previousRAF = null;

    this._collide = new Array();
    this._LoadAnimatedModel();

      this._LoadMonster(-270, 0, -280);
      this._LoadMonster(-270, 0, -240);
      this._LoadMonster(-270, 0, -200);
      this._LoadMonster(-270, 0, -160);
    
      
      this._LoadMonster(-270, 0, 90);
      this._LoadMonster(-270, 0, 130);
      this._LoadMonster(-270, 0, 170);
      this._LoadMonster(-270, 0, 210);
  
     
    this._RAF();
  }

  _LoadMonster(x, y, z){
    const ms = new FBXLoader();
    ms.setPath('./resources/zombie/');
    ms.load('gana.fbx', (fbx) => {
      fbx.scale.setScalar(0.1);
      fbx.traverse(c => {
        c.castShadow = true;
      });

      const anim = new FBXLoader();
      anim.setPath('./resources/zombie/');
      anim.load('bow.fbx', (anim) => {
        const m = new THREE.AnimationMixer(fbx);
        this._mixers.push(m);
        const idle = m.clipAction(anim.animations[0]);
        idle.play();
        this._scene.add(anim);
      });
      this._target = fbx;
      this._target.position.x = x;
      this._target.position.y = y;
      this._target.position.z = z;
      this._target.rotation.y = -80;
      // let BB = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
      // BB.setFromObject(this._target, true);
      let BB = new Pos( this._target.position.x,  this._target.position.y,  this._target.position.z);
      this._scene.add(this._target);
      this._collide.push(BB);
    });

  }

  _LoadAnimatedModel() {
    const params = {
      camera: this._camera,
      scene: this._scene,
    }
    this._controls = new BasicCharacterController(params);

    this._thirdPersonCamera = new ThirdPersonCamera({
      camera: this._camera,
      target: this._controls,
    });
  }

  _OnWindowResize() {
    this._camera.aspect = window.innerWidth / window.innerHeight;
    this._camera.updateProjectionMatrix();
    this._threejs.setSize(window.innerWidth, window.innerHeight);
  }

  _RAF() {
    requestAnimationFrame((t) => {
      if (this._previousRAF === null) {
        this._previousRAF = t;
      }

      this._RAF();

      this._threejs.render(this._scene, this._camera);
      this._Step(t - this._previousRAF);
      this._previousRAF = t;
      // console.log(this._collide.length);
      // console.log(this._collide[0].x, this._collide[0].y, this._collide[0].z);
      // console.log(this._controls.Position.x, this._controls.Position.y, this._controls.Position.z);
      
    });
  }

  _Step(timeElapsed) {
    const timeElapsedS = timeElapsed * 0.001;
    if (this._mixers) {
      this._mixers.map(m => m.update(timeElapsedS));
    }

    if (this._controls) {
      this._controls.Update(timeElapsedS);
    }

    this._thirdPersonCamera.Update(timeElapsedS);
  }
}


let _APP = null;

window.addEventListener('DOMContentLoaded', () => {
  _APP = new Core();
});


function _LerpOverFrames(frames, t) {
  const s = new THREE.Vector3(0, 0, 0);
  const e = new THREE.Vector3(100, 0, 0);
  const c = s.clone();

  for (let i = 0; i < frames; i++) {
    c.lerp(e, t);
  }
  return c;
}

function _TestLerp(t1, t2) {
  const v1 = _LerpOverFrames(100, t1);
  const v2 = _LerpOverFrames(50, t2);
  console.log(v1.x + ' | ' + v2.x);
}

_TestLerp(0.01, 0.01);
_TestLerp(1.0 / 100.0, 1.0 / 50.0);
_TestLerp(1.0 - Math.pow(0.3, 1.0 / 100.0), 
          1.0 - Math.pow(0.3, 1.0 / 50.0));
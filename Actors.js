class Actors{
    constructor(){}
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
          this._scene.add(this._target);
        });
      }
    
}

export {Actors};
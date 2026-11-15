import * as THREE from 'three';

export class Controls {
  yaw = 0;
  pitch = -.04;
  walk = new THREE.Vector2();
  keys = new Set<string>();
  enabled = true;
  private pointers = new Map<number,{x:number;y:number;lastX:number;lastY:number;side:string;moved:number}>();

  constructor(private canvas:HTMLCanvasElement,private tap:(x:number,y:number)=>void) {
    const joystick=document.querySelector<HTMLElement>('#joystick')!;
    const thumb=joystick.querySelector('i')!;
    canvas.addEventListener('pointerdown',e=>{
      if(!this.enabled)return;
      canvas.focus();canvas.setPointerCapture(e.pointerId);
      const side=e.pointerType==='mouse'?'look':e.clientX<innerWidth/2?'walk':'look';
      if([...this.pointers.values()].some(p=>p.side===side))return;
      this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,side,moved:0});
      if(side==='walk'){joystick.style.display='block';joystick.style.left=`${e.clientX-50}px`;joystick.style.top=`${e.clientY-50}px`;}
    });
    canvas.addEventListener('pointermove',e=>{
      const p=this.pointers.get(e.pointerId);if(!p||!this.enabled)return;
      p.moved=Math.max(p.moved,Math.hypot(e.clientX-p.x,e.clientY-p.y));
      if(p.side==='walk'){
        this.walk.set((e.clientX-p.x)/48,(e.clientY-p.y)/48).clampLength(0,1);
        thumb.style.transform=`translate(${this.walk.x*30}px,${this.walk.y*30}px)`;
      }else{this.yaw-=(e.clientX-p.lastX)*.004;this.pitch=THREE.MathUtils.clamp(this.pitch-(e.clientY-p.lastY)*.003,-1.15,1.15);}
      p.lastX=e.clientX;p.lastY=e.clientY;
    });
    const release=(e:PointerEvent)=>{
      const p=this.pointers.get(e.pointerId);if(!p)return;
      if(p.side==='walk'){this.walk.set(0,0);joystick.style.display='none';thumb.style.transform='';}
      this.pointers.delete(e.pointerId);
      if(e.type==='pointerup'&&p.moved<9&&this.enabled)this.tap(e.clientX,e.clientY);
    };
    canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
    window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();this.keys.add(e.key.toLowerCase());});
    window.addEventListener('keyup',e=>this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur',()=>this.reset());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.reset();});
  }

  reset(){this.keys.clear();this.walk.set(0,0);this.pointers.clear();document.querySelector<HTMLElement>('#joystick')!.style.display='none';}

  direction() {
    const x=this.walk.x+(this.keys.has('d')||this.keys.has('arrowright')?1:0)-(this.keys.has('a')||this.keys.has('arrowleft')?1:0);
    const z=this.walk.y+(this.keys.has('s')||this.keys.has('arrowdown')?1:0)-(this.keys.has('w')||this.keys.has('arrowup')?1:0);
    return new THREE.Vector3(x,0,z).clampLength(0,1).applyAxisAngle(new THREE.Vector3(0,1,0),this.yaw);
  }
}

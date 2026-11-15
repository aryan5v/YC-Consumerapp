import * as THREE from 'three';
import { createThing, type Thing } from './things';
import { heightAt, WATER } from './terrain';
import { kinds, spot, SECTOR } from './layout';
import { addRim } from './shading';


export class Landmarks {
  group=new THREE.Group();
  things=new Map<string,Thing>();
  outcomes=new Map<string,Record<string,unknown>>();
  constructor(public seed:number){}

  update(player:THREE.Vector3,elapsed:number){
    const sector=Math.round(-player.z/SECTOR);
    for(let s=sector-1;s<=sector+1;s++){
      for(let i=0;i<kinds.length;i++){
        const kind=kinds[i],id=`${this.seed}:${s}:${kind}`;
        if(this.things.has(id))continue;
        const {x,z}=spot(i,s,this.seed);
        const thing=createThing(kind,id);
        const styled=new Set<THREE.Material>();
        thing.root.traverse(o=>{if(o instanceof THREE.Mesh&&!o.userData.effect&&o.material instanceof THREE.MeshStandardMaterial&&!styled.has(o.material)){styled.add(o.material);o.material.color.lerp(new THREE.Color('#e8eef1'),.16);o.material.metalness*=.5;addRim(o.material,.4);}});
        thing.root.position.set(x,kind==='boat'?WATER+.14:heightAt(x,z,this.seed),z);
        if(kind==='boat')thing.root.rotation.y=-.65;
        thing.root.userData.sector=s;
        const outcome=this.outcomes.get(id);if(outcome)thing.apply(outcome);
        this.things.set(id,thing);this.group.add(thing.root);
      }
    }
    for(const [id,thing] of this.things){
      if(Math.abs(thing.root.userData.sector-sector)>1){this.group.remove(thing.root);thing.dispose();this.things.delete(id);}
      else if(thing.root.position.distanceToSquared(player)<120*120)thing.update(elapsed,player);
    }
  }

  reachable(player:THREE.Vector3){
    return [...this.things.values()].filter(t=>t.root.visible&&Math.hypot(player.x-t.root.position.x,player.z-t.root.position.z)<t.radius+5.5);
  }

  apply(id:string,change:Record<string,unknown>){
    this.outcomes.set(id,{...this.outcomes.get(id),...change});this.things.get(id)?.apply(change);
  }

  canWalk(x:number,z:number){
    for(const thing of this.things.values()){
      if(!thing.root.visible||thing.kind==='arch'||thing.kind==='boat')continue;
      const radius=thing.kind==='lighthouse'?2.4:thing.kind==='cabin'?2.7:thing.kind==='well'?1.15:.35;
      if(Math.hypot(x-thing.root.position.x,z-thing.root.position.z)<radius)return false;
    }
    return true;
  }

  dispose(){for(const thing of this.things.values())thing.dispose();this.things.clear();this.group.clear();this.outcomes.clear();}
}

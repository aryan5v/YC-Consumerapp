export type WorldMessage =
  | {type:'setSeed';seed:number|string}
  | {type:'setTime';timeOfDay:number;day?:number}
  | {type:'pause'|'resume'}
  | {type:'mute';muted:boolean}
  | {type:'applyOutcome';thingId:string;change:Record<string,unknown>};

declare global {
  interface Window {
    ReactNativeWebView?: {postMessage:(message:string)=>void};
    ForkWorld: {receive:(message:unknown)=>void;getState:()=>unknown};
  }
}

export function post(message:Record<string,unknown>){
  if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(message));
  else window.parent.postMessage(message,'*');
}

export function bridge(receive:(message:WorldMessage)=>void,getState:()=>unknown){
  const accept=(input:unknown)=>{
    let data=input;
    if(typeof data==='string'){try{data=JSON.parse(data);}catch{return;}}
    if(!data||typeof data!=='object')return;
    const m=data as Record<string,unknown>;
    if(m.type==='pause'||m.type==='resume'){receive({type:m.type});return;}
    if(m.type==='setSeed'&&(typeof m.seed==='string'&&m.seed.length<256||typeof m.seed==='number'&&Number.isFinite(m.seed))){receive(m as WorldMessage);return;}
    if(m.type==='setTime'&&typeof m.timeOfDay==='number'&&Number.isFinite(m.timeOfDay)&&(m.day===undefined||typeof m.day==='number'&&Number.isFinite(m.day)&&m.day>=1)){receive(m as WorldMessage);return;}
    if(m.type==='mute'&&typeof m.muted==='boolean'){receive(m as WorldMessage);return;}
    if(m.type==='applyOutcome'&&typeof m.thingId==='string'&&m.change&&typeof m.change==='object'&&!Array.isArray(m.change)){receive(m as WorldMessage);}
  };
  const event=(e:MessageEvent)=>accept(e.data);
  window.addEventListener('message',event);
  document.addEventListener('message',event as EventListener);
  window.ForkWorld={receive:accept,getState};
}

export function seedNumber(seed:number|string){
  if(typeof seed==='number')return seed|0;
  let h=2166136261;
  for(const c of seed){h=Math.imul(h^c.charCodeAt(0),16777619);}
  return h|0;
}

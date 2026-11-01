/* EXPALSA · Cronómetro de acompañamiento. No modifica los registros de evaluación. */
export function createTrainingTimer({getSession,getPersonName,notify}){
  const KEY='expalsa_capacitacion_cronometro_v1';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let record=null;
  let dialogShown=false;
  let ticker=null;
  function now(){return Date.now();}
  function recover(){
    try{
      const data=JSON.parse(sessionStorage.getItem(KEY)||'null');
      if(data&&typeof data==='object'&&typeof data.sessionId==='string'&&
        typeof data.name==='string'&&Number.isFinite(data.deadline)&&Number.isInteger(data.duration)&&
        data.duration>=1&&data.duration<=480&&['running','finished'].includes(data.status)){
        return data;
      }
    }catch(e){/* Datos locales inválidos: no se restauran. */}
    return null;
  }
  function persist(){
    try{
      if(record)sessionStorage.setItem(KEY,JSON.stringify(record));
      else sessionStorage.removeItem(KEY);
    }catch(e){/* Un temporizador abierto sigue funcionando aun si el almacenamiento está bloqueado. */}
  }
  record=recover();
  function secondsLeft(){
    if(!record||record.status==='finished')return 0;
    return Math.max(0,Math.ceil((record.deadline-now())/1000));
  }
  function format(seconds){
    const m=Math.floor(Math.max(0,seconds)/60);
    const s=Math.max(0,seconds)%60;
    return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  }
  function modal(){
    let modal=$('trainingTimerDialog');
    if(modal)return modal;
    modal=document.createElement('dialog');
    modal.id='trainingTimerDialog';
    modal.className='training-timer-dialog';
    modal.setAttribute('aria-labelledby','trainingTimerDialogTitle');
    modal.innerHTML='<div class="training-timer-icon" aria-hidden="true">✓</div>'+
      '<h2 id="trainingTimerDialogTitle">Tiempo de acompañamiento finalizado</h2>'+
      '<p id="trainingTimerDialogDescription"></p>'+
      '<button type="button" class="button primary" id="trainingTimerAccept">Aceptar</button>';
    document.body.appendChild(modal);
    modal.addEventListener('cancel',e=>e.preventDefault());
    modal.addEventListener('click',e=>{if(e.target===modal)e.stopPropagation();});
    modal.querySelector('#trainingTimerAccept').addEventListener('click',()=>{
      modal.close();
      dialogShown=false;
      record=null;
      persist();
      refresh();
    });
    return modal;
  }
  function finishIfNeeded(){
    if(!record)return;
    if(record.status==='running'&&secondsLeft()===0){
      record.status='finished';
      persist();
    }
    if(record.status==='finished'&&!dialogShown){
      const m=modal();
      const name=record.name||'este inspector';
      $('trainingTimerDialogDescription').textContent='El tiempo de acompañamiento de '+name+
        ' ha finalizado ('+record.duration+' minutos).';
      dialogShown=true;
      if(!m.open)m.showModal();
    }
  }
  function refresh(){
    finishIfNeeded();
    const visible=$('trainingCountdown');
    const global=$('globalTrainingTimer');
    const start=$('trainingTimerStart');
    const field=$('evalMinutes');
    const current=getSession?.();
    const active=!!record;
    const left=active?secondsLeft():0;
    const same=active&&record.sessionId===current?.id;
    if(visible){
      visible.hidden=!active;
      visible.textContent=active?format(left):'';
      visible.classList.toggle('finishing',active&&left<=60);
    }
    if(start){
      start.disabled=active||!current||current.status==='done';
      start.textContent='Iniciar';
    }
    if(field)field.readOnly=active&&same;
    const label=$('trainingTimerPerson');
    if(label){
      label.hidden=!active;
      label.textContent=active?'Cronómetro: '+record.name+(same?'':' · otra jornada'):'';
    }
    if(global){
      global.hidden=!active;
      global.textContent=active?'⏱ '+format(left)+' · '+record.name:'';
      global.title=active?'Cuenta regresiva de '+record.name:'';
    }
  }
  function start(){
    if(record){
      finishIfNeeded();
      notify?.('Ya hay un cronómetro de acompañamiento en curso.');
      return;
    }
    const session=getSession?.();
    if(!session||!session.id){notify?.('Selecciona un inspector.');return;}
    if(session.status==='done'){notify?.('La jornada está finalizada.');return;}
    const input=$('evalMinutes');
    const amount=Number(input?.value??session.minutes);
    if(!Number.isInteger(amount)||amount<1||amount>480){
      notify?.('Ingresa un tiempo entre 1 y 480 minutos.');
      return;
    }
    record={
      sessionId:session.id,
      name:String(getPersonName?.(session)||session.personName||'el inspector'),
      duration:amount,
      deadline:now()+amount*60000,
      status:'running'
    };
    persist();
    refresh();
  }
  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('[data-training-timer-start]');
    if(btn)start();
  });
  ticker=setInterval(refresh,350);
  document.addEventListener('visibilitychange',refresh);
  window.addEventListener('focus',refresh);
  refresh();
  return {refresh,start,format,getState:()=>record?{...record,secondsLeft:secondsLeft()}:null};
}

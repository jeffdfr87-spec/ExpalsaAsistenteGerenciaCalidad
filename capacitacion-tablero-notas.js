import {esc as E,finite} from './capacitacion-graficos.js?v=20261103-puntos-1';
export const gradeBoardStyles=`
.grade-board{min-width:0}.grade-board h2{margin:0}.grade-board-scroll{overflow:auto;max-width:100%;border-radius:12px;margin-top:22px;scrollbar-width:thin}
.grade-board-grid{display:grid;grid-template-columns:minmax(240px,1.9fr) repeat(10,minmax(52px,1fr));gap:6px;min-width:910px;align-items:stretch}
.grade-board-head{padding:8px 3px;color:#667b86;font-size:.76rem;font-weight:650;text-align:center;font-variant-numeric:tabular-nums}
.grade-board-name{display:flex;align-items:center;gap:11px;padding:8px 12px 8px 2px;background:#fff;position:sticky;left:0;z-index:1;border-radius:10px;min-width:0;color:#203c4a;font-size:.86rem;font-weight:650;line-height:1.4}
.grade-board-name img,.grade-board-avatar{width:36px;height:36px;border-radius:50%;flex:none;object-fit:cover;background:#e8eff0;color:#526e79;display:grid;place-items:center;font-size:.75rem;font-weight:700}.grade-board-name span:last-child{overflow-wrap:anywhere}
.grade-board-cell{border:1px solid transparent;min-height:48px;border-radius:9px;padding:10px 3px;display:grid;place-items:center;font-size:.9rem;font-weight:700;font-variant-numeric:tabular-nums;cursor:pointer;transition:box-shadow .15s,filter .15s}
.grade-board-cell.target{background:#4c936b;color:#fff}.grade-board-cell.reinforce{background:#d4a53c;color:#322811}.grade-board-cell.priority{background:#bf5b53;color:#fff}.grade-board-cell.pending{background:#e7edef;color:#667c86}
.grade-board-cell:hover{filter:brightness(.96);box-shadow:inset 0 0 0 2px #193b4c55}.grade-board-cell:focus-visible{outline:3px solid #1f5c6b;outline-offset:2px}
.grade-board-legend{display:flex;gap:12px 20px;flex-wrap:wrap;margin-top:20px;color:#5f7581;font-size:.76rem}.grade-board-legend span{display:inline-flex;align-items:center;gap:7px}.grade-board-swatch{display:inline-block;width:12px;height:12px;border-radius:4px;flex:none}.grade-board-swatch.target{background:#4c936b}.grade-board-swatch.reinforce{background:#d4a53c}.grade-board-swatch.priority{background:#bf5b53}.grade-board-swatch.pending{background:#e7edef}
@media(max-width:750px){.grade-board-grid{grid-template-columns:155px repeat(10,52px);min-width:735px}.grade-board-name{font-size:.76rem;gap:7px;padding-right:8px}.grade-board-name img,.grade-board-avatar{width:28px;height:28px;font-size:.65rem}.grade-board-cell{min-height:44px}.grade-board-legend{font-size:.7rem;gap:10px 14px}}
@media(prefers-reduced-motion:reduce){.grade-board-cell{transition:none}}
`;
const photo=s=>typeof s==='string'&&(/^(data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+)$/.test(s)||s.startsWith('blob:'));
export function gradeBoard(series,{simulated=false}={}){
 if(!series.length)return '';
 let html='<section class="panel grade-board"><div class="section-title"><h2>Tablero de notas</h2><span class="tag '+(simulated?'warn':'gray')+'">'+(simulated?'EJEMPLO':'D01–D10')+'</span></div><div class="grade-board-scroll"><div class="grade-board-grid" role="group" aria-label="Notas por inspector y jornada"><div class="grade-board-head" style="text-align:left">Inspector</div>';
 for(let i=0;i<10;i++)html+='<div class="grade-board-head">D'+String(i+1).padStart(2,'0')+'</div>';
 for(const row of series){
  const person=row.person||{},name=String(person.name||'Inspector'),initials=name.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('');
  html+='<div class="grade-board-name">'+(photo(person.portrait)?'<img src="'+E(person.portrait)+'" alt="">':'<span class="grade-board-avatar" aria-hidden="true">'+E(initials)+'</span>')+'<span>'+E(name)+'</span></div>';
  for(let i=0;i<10;i++){
   const value=row.practice?.[i],known=finite(value),band=!known?'pending':value>=85?'target':value>=70?'reinforce':'priority',label=name+' · Día '+(i+1)+' · '+(known?value.toFixed(1)+'%':'Sin evaluar');
   const action=simulated?'data-board-example="'+E(row.id)+'" data-board-day="'+i+'"':'data-open="'+E(row.id)+'" data-day="'+(i+1)+'"';
   html+='<button type="button" class="grade-board-cell '+band+'" '+action+' aria-label="'+E(label)+'" title="'+E(label)+'">'+(known?Math.round(value):'')+'</button>';
  }
 }
 return html+'</div></div><div class="grade-board-legend"><span><i class="grade-board-swatch target"></i>85 o más</span><span><i class="grade-board-swatch reinforce"></i>70 a 84</span><span><i class="grade-board-swatch priority"></i>Menos de 70 · refuerzo</span><span><i class="grade-board-swatch pending"></i>Sin evaluar</span></div></section>';
}

import { newStep } from './model.js'
export function emptyStep(position) {
  return { ...newStep({key:'',apiId:'local',method:'',path:'',name:'New request'}, {fields:{},body:''}), ...(position ? { position: {x:Math.max(20, Math.min(20000, position.x)),y:Math.max(20, Math.min(20000, position.y))} } : {}) }
}
export function configureEndpoint(step, operation, session, previousName) {
  const next = newStep(operation, session)
  return { ...next, id: step.id, label: step.label === 'New request' || step.label === previousName ? operation.name : step.label,
    ...(step.position ? {position:{...step.position}} : {}) }
}

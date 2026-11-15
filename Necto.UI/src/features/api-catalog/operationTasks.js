const roles=['Search','Read','Create','Update','Delete','Action']
export function validateOperationTasks(data){
 if(!Array.isArray(data)||data.length>20000||data.some(item=>typeof item?.operationId!=='string'||typeof item.entityId!=='string'||typeof item.entityName!=='string'||!roles.includes(item.role)||(item.description!=null&&typeof item.description!=='string')))throw new Error('Unsupported operation roles.')
 return data
}
export function operationTasks(entries,operations,query='',page=1){
 const matching=entries.flatMap(entry=>{
  const matches=operations.filter(operation=>(operation.apiId??'local')==='local'&&operation.id===entry.operationId)
  return matches.length===1?[{...entry,operation:matches[0]}]:[]
 }).filter(entry=>`${entry.entityName} ${entry.role} ${entry.description??''} ${entry.operation.name}`.toLowerCase().includes(query.toLowerCase()))
 .sort((a,b)=>a.entityName.localeCompare(b.entityName)||roles.indexOf(a.role)-roles.indexOf(b.role))
 return {total:matching.length,items:matching.slice((page-1)*25,page*25)}
}

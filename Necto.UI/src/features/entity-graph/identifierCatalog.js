export function catalogUses(entry, operations) {
  return (entry.uses ?? []).flatMap(use => {
    const matches=operations.filter(operation=>(operation.apiId ?? 'local')==='local' && operation.id===use.operationId)
    return matches.length===1 ? [{...use,operation:matches[0],pathLabel:(use.path ?? []).map(part=>part===null?'[]':part).join('.')}] : []
  })
}
export function catalogPage(entries, query, page=1) {
  const matching=entries.filter(entry=>`${entry.name} ${entry.kind}`.toLowerCase().includes(query.toLowerCase()))
  return {total:matching.length,items:matching.slice((page-1)*25,page*25)}
}
export function validateEntityCatalog(data) {
 if(!Array.isArray(data)||data.length>20000||data.some(item=>typeof item?.id!=='string'||typeof item.name!=='string'||!['model','identifier'].includes(item.kind)||!Array.isArray(item.uses)||item.uses.length>2000||item.uses.some(use=>typeof use?.operationId!=='string'||!['request','response'].includes(use.direction)||typeof use.location!=='string'||!Array.isArray(use.path)||use.path.length>18||use.path.some(part=>part!==null&&typeof part!=='string'))))throw new Error('Unsupported entity catalog.')
 return data
}

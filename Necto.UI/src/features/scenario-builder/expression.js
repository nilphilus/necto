// This is an AST interpreter, never JavaScript execution in the host realm.
// Adding syntax or operators expands the security boundary: keep the whitelist small.
import { parse } from 'acorn'
export const EXPRESSION_LIMITS = Object.freeze({ source:4096, astNodes:512, depth:32, bindings:16, instructions:2500, inputBytes:1024*1024, outputBytes:65536, values:10000 })
const forbidden=new Set(['__proto__','prototype','constructor'])
const identifier=name=>typeof name==='string'&&/^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/.test(name)&&!forbidden.has(name)
const binary=new Set(['+','-','*','/','%','===','!==','<','<=','>','>='])
const nodes=new Set(['Program','BlockStatement','ReturnStatement','IfStatement','SwitchStatement','SwitchCase','BreakStatement','EmptyStatement','VariableDeclaration','VariableDeclarator','Identifier','Literal','MemberExpression','ObjectExpression','Property','ArrayExpression','ConditionalExpression','LogicalExpression','BinaryExpression','UnaryExpression'])
const fail=()=>{throw new Error('Expression uses unsupported syntax or exceeds its limits.')}
export function parseExpression(code) {
 if(typeof code!=='string'||!code.trim()||code.length>EXPRESSION_LIMITS.source)fail()
 let ast;try{ast=parse(code,{ecmaVersion:2022,sourceType:'script',allowReturnOutsideFunction:true})}catch{fail()}
 const stack=[{node:ast,depth:0}];let count=0
 while(stack.length){
  const {node,depth}=stack.pop()
  if(!nodes.has(node.type)||++count>EXPRESSION_LIMITS.astNodes||depth>EXPRESSION_LIMITS.depth)fail()
  if(node.type==='Identifier'&&!identifier(node.name)||node.type==='Literal'&&(node.regex||node.bigint!==undefined||typeof node.value==='number'&&!Number.isFinite(node.value))||node.type==='VariableDeclaration'&&node.kind!=='const'||node.type==='VariableDeclarator'&&(node.id.type!=='Identifier'||!node.init)||node.type==='MemberExpression'&&node.optional||node.type==='Property'&&(node.kind!=='init'||node.method||node.computed)||node.type==='BinaryExpression'&&!binary.has(node.operator)||node.type==='UnaryExpression'&&!['!','-','+'].includes(node.operator)||node.type==='LogicalExpression'&&!['&&','||','??'].includes(node.operator)||node.type==='BreakStatement'&&node.label||node.type==='ArrayExpression'&&node.elements.some(value=>!value))fail()
  for(const value of Object.values(node)){
   if(Array.isArray(value)){for(const child of value)if(child?.type)stack.push({node:child,depth:depth+1})}
   else if(value?.type)stack.push({node:value,depth:depth+1})
  }
 }
 return ast
}
export function validateExpression(input) {
 parseExpression(input.expression)
 if(!Array.isArray(input.bindings)||input.bindings.length>EXPRESSION_LIMITS.bindings)fail()
 const names=new Set()
 for(const binding of input.bindings){
  if(!binding||!identifier(binding.name)||names.has(binding.name)||!['response','variable'].includes(binding.source))fail()
  names.add(binding.name)
  if(binding.source==='variable'){if(typeof binding.variableId!=='string'||!binding.variableId)fail()}
  else if(typeof binding.stepId!=='string'||!binding.stepId||typeof binding.responsePointer!=='string'||binding.responsePointer.length>2048||binding.responsePointer!==''&&(!binding.responsePointer.startsWith('/')||/~(?![01])/u.test(binding.responsePointer)))fail()
 }
}
export const expressionSnapshot=input=>({expression:input.expression,bindings:input.bindings.map(binding=>({name:binding.name,source:binding.source,...(binding.source==='variable'?{variableId:binding.variableId}:{stepId:binding.stepId,responsePointer:binding.responsePointer})}))})

// Copy only plain JSON data using descriptors: no getters, prototypes or host objects.
function jsonCopy(value,budget,depth=0) {
 if(++budget.nodes>EXPRESSION_LIMITS.values||depth>EXPRESSION_LIMITS.depth)fail()
 const spend=amount=>{budget.bytes+=amount;if(budget.bytes>budget.max)fail()}
 if(value===null){spend(4);return null}
 if(typeof value==='string'){spend(value.length*3+2);return value}
 if(typeof value==='boolean'){spend(5);return value}
 if(typeof value==='number'){if(!Number.isFinite(value))fail();spend(24);return value}
 if(!value||typeof value!=='object'||![Object.prototype,null,Array.prototype].includes(Object.getPrototypeOf(value)))fail()
 const array=Array.isArray(value),out=array?[]:Object.create(null),keys=[]
 if(array&&value.length>EXPRESSION_LIMITS.values-budget.nodes)fail()
 for(const key in value)if(Object.hasOwn(value,key)){if(keys.length>=EXPRESSION_LIMITS.values-budget.nodes)fail();keys.push(key)}
 if(array&&value.length!==keys.length)fail()
 spend(2)
 for(const key of keys){
  if(forbidden.has(key))fail()
  const descriptor=Object.getOwnPropertyDescriptor(value,key)
  if(!descriptor||!Object.hasOwn(descriptor,'value'))fail()
  spend(key.length*3+4)
  Object.defineProperty(out,key,{value:jsonCopy(descriptor.value,budget,depth+1),enumerable:true,writable:false,configurable:false})
 }
 return out
}
const budget=max=>({nodes:0,bytes:0,max})
export function evaluateExpression(code,values) {
 try{
  const ast=parseExpression(code),input=jsonCopy(values,budget(EXPRESSION_LIMITS.inputBytes))
  const root=new Map(Object.entries(input));let remaining=EXPRESSION_LIMITS.instructions
  const tick=()=>{if(--remaining<0)fail()}
  const bounded=value=>{if(typeof value==='number'&&!Number.isFinite(value)||typeof value==='string'&&value.length>EXPRESSION_LIMITS.outputBytes)fail();return value}
  const scalar=value=>{if(value!==null&&!['string','boolean','number','undefined'].includes(typeof value))fail();return value}
  function expr(node,scope){
   tick()
   switch(node.type){
    case 'Literal':return bounded(node.value)
    case 'Identifier':if(!scope.has(node.name))fail();return scope.get(node.name)
    case 'ArrayExpression':return node.elements.map(item=>expr(item,scope))
    case 'ObjectExpression':{
     const out=Object.create(null)
     for(const property of node.properties){const key=property.key.type==='Identifier'?property.key.name:property.key.value;if(typeof key!=='string'&&typeof key!=='number'||forbidden.has(String(key)))fail();out[key]=expr(property.value,scope)}
     return out
    }
    case 'MemberExpression':{
     const object=expr(node.object,scope),key=node.computed?expr(node.property,scope):node.property.name
     if(typeof key!=='string'&&typeof key!=='number'||forbidden.has(String(key)))fail()
     if((Array.isArray(object)||typeof object==='string')&&key==='length')return object.length
     if(!object||typeof object!=='object')fail()
     return Object.hasOwn(object,key)?object[key]:undefined
    }
    case 'ConditionalExpression':return expr(node.test,scope)?expr(node.consequent,scope):expr(node.alternate,scope)
    case 'LogicalExpression':{const left=expr(node.left,scope);return node.operator==='&&'?(left?expr(node.right,scope):left):node.operator==='||'?(left?left:expr(node.right,scope)):(left===null||left===undefined?expr(node.right,scope):left)}
    case 'UnaryExpression':{const value=expr(node.argument,scope);if(node.operator==='!')return !value;if(typeof value!=='number')fail();return bounded(node.operator==='-'?-value:+value)}
    case 'BinaryExpression':{
     const left=scalar(expr(node.left,scope)),right=scalar(expr(node.right,scope));let result
     switch(node.operator){
      case '===':return left===right
      case '!==':return left!==right
      case '+':if(typeof left==='string'&&typeof right==='string'){if(left.length+right.length>EXPRESSION_LIMITS.outputBytes)fail();return left+right}if(typeof left!=='number'||typeof right!=='number')fail();result=left+right;break
      case '-':case '*':case '/':case '%':if(typeof left!=='number'||typeof right!=='number')fail();result=node.operator==='-'?left-right:node.operator==='*'?left*right:node.operator==='/'?left/right:left%right;break
      default:if(typeof left!==typeof right||!['number','string'].includes(typeof left))fail();return node.operator==='<'?left<right:node.operator==='<='?left<=right:node.operator==='>'?left>right:left>=right
     }
     return bounded(result)
    }
    default:fail()
   }
  }
  function sequence(body,scope){for(const node of body){const flow=statement(node,scope);if(flow)return flow}}
  function statement(node,scope){
   tick()
   switch(node.type){
    case 'EmptyStatement':return
    case 'BlockStatement':return sequence(node.body,new Map(scope))
    case 'ReturnStatement':if(!node.argument)fail();return {kind:'return',value:expr(node.argument,scope)}
    case 'VariableDeclaration':for(const item of node.declarations){if(scope.has(item.id.name))fail();scope.set(item.id.name,expr(item.init,scope))}return
    case 'IfStatement':return expr(node.test,scope)?statement(node.consequent,scope):node.alternate?statement(node.alternate,scope):undefined
    case 'BreakStatement':return {kind:'break'}
    case 'SwitchStatement':{
     const value=expr(node.discriminant,scope);let start=node.cases.findIndex(item=>item.test&&expr(item.test,scope)===value)
     if(start<0)start=node.cases.findIndex(item=>!item.test)
     if(start<0)return
     const local=new Map(scope)
     for(let i=start;i<node.cases.length;i++){const flow=sequence(node.cases[i].consequent,local);if(flow)return flow.kind==='break'?undefined:flow}return
    }
    default:fail()
   }
  }
  const result=sequence(ast.body,root)
  if(result?.kind!=='return')fail()
  const copy=jsonCopy(result.value,budget(EXPRESSION_LIMITS.outputBytes))
  // Return detached ordinary JSON to the request builder, never interpreter internals.
  return JSON.parse(JSON.stringify(copy))
 }catch{throw new Error('Expression failed: check syntax, selected inputs and limits. No request was sent for this step.')}
}

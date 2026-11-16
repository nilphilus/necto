import test from 'node:test'
import assert from 'node:assert/strict'
import { wheelScale, zoomScroll, MIN_ZOOM, MAX_ZOOM } from '../graph-navigation.js'
test('wheel zoom is proportional at overview scales and normalizes input devices',()=>{
 assert.ok(wheelScale(.03,-100,0,600)>.03)
 assert.equal(wheelScale(1,2,1,600),wheelScale(1,32,0,600))
 assert.equal(wheelScale(1,1,2,120),wheelScale(1,120,0,120))
 assert.equal(wheelScale(MIN_ZOOM,100,0,600),MIN_ZOOM)
 assert.equal(wheelScale(MAX_ZOOM,-100,0,600),MAX_ZOOM)
})
test('zoom keeps the world coordinate under the mouse stationary',()=>{
 const scroll=640,cursor=170,before=.4,after=1.7
 const next=zoomScroll(scroll,cursor,before,after)
 assert.equal((next+cursor)/after,(scroll+cursor)/before)
})

#!/usr/bin/env node

const compiler = require('./compiler')
const writer = require('./writer')
const tester = require('./tester')

const [,, ...args] = process.argv

if (args.length > 0) {
  const action  = args[0]

  const projRoot = process.cwd()

  // if ('compile' == action) {
  //   compiler.compile(projRoot)
  // } else 
  if ('build' == action) {
    tester.build(projRoot)
  } 
  // else if ('write' == action) {
  //   writer.write(projRoot)
  // } 
  else {
    console.error("Unknown Action:", action)
  }
} else {
  console.error("Missing Action !")
}


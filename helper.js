#!/usr/bin/env node
var path = require('path');
var util = require('./comm/util')
const parser = require('./comm/parser')
const mustache = require('mustache')

const tagDocuments = async function (docRoot) {
  const docs = util.traverseFiles(docRoot, 'md')
  for (const i in docs) {
    const doc = docs[i]
    const newDoc = await parser.taggingDoc(doc)
    console.log(newDoc, "is tagged.")
  }
}

const args = require('yargs')
  .command('tag [docs]', 'add tag to docs', (yargs) => {
    yargs
      .require('docs', {
        describe: 'docs to add tag'
      })
  }, (argv) => {
    tagDocuments(argv.docs)
  })
  .argv
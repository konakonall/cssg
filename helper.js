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

const assemble = async function (config, docRoot, template) {
  const docs = util.traverseFiles(docRoot, 'md')
  var snippets = []
  for (const i in docs) {
    const doc = docs[i]
    const subSnippets = await parser.parseDOC2Prototype(doc)
    Array.prototype.push.apply(snippets, subSnippets);
  }
  const protoFile = path.join(path.dirname(template), 'Assembly' + config.sourceExtension)
  const tpl = util.loadFileContent(template)
  var snp = []
  var tops = []
  for (var i in snippets) {
    const snippet = snippets[i]
    if (!snippet.name || !snippet.bodyBlock || snippet.bodyBlock.length < 1) {
      continue
    }
    if (snippet.name.endsWith('topcls')) {
      tops.push({
        name: snippet.name,
        code: snippet.bodyBlock
      })
    } else {
      snp.push({
        index: i,
        name: snippet.name,
        code: snippet.bodyBlock
      })
    }
  }
  const codeContent = mustache.render(tpl, {
    top: tops,
    snippets: snp
  })
  util.saveFile(protoFile, codeContent)
}

const args = require('yargs').argv

const action  = args.action

const projRoot = process.cwd()
const config = util.loadEntryConfig(projRoot, 'cssg.json')

if ('tagging' == action) {
  const docRoot = path.join(projRoot, args.dir)
  tagDocuments(docRoot)
} else if ('assemble' == action) {
  const docRoot = path.join(projRoot, args.dir)
  const template = path.join(projRoot, args.template)
  assemble(config, docRoot, template)
} else if (action) {
  console.error("Unknown Action:", action)
} else {
  console.error("Missing Action !")
}
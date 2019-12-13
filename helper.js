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

const assemble = async function (docRoot, template) {
  const docs = util.traverseFiles(docRoot, 'md')
  var snippets = []
  for (const i in docs) {
    const doc = docs[i]
    const subSnippets = await parser.parseDOC2Prototype(doc)
    Array.prototype.push.apply(snippets, subSnippets);
  }
  const protoFile = path.join(path.dirname(template), 'Assembly')
  const tpl = util.loadFileContent(template)
  var snp = []
  var top = []
  for (var i in snippets) {
    const snippet = snippets[i]
    if (!snippet.name || !snippet.bodyBlock || snippet.bodyBlock.length < 1) {
      continue
    }
    if (snippet.name.startsWith("global-init")) {
      top.push({
        index: i,
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
    top: top,
    snippets: snp
  })
  util.saveFile(protoFile, codeContent)
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
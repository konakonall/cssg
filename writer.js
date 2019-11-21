const fs = require('fs')
const path = require('path')
const util = require('./comm/util')
const parser = require('./comm/parser')

const write = async function (projRoot) {
  const config = util.loadEntryConfig(projRoot)

  const docsRoot = path.join(projRoot, config['docsRoot'])
  if (!fs.existsSync(docsRoot)) {
    console.warn('NO DOC Folder !')
    return
  }
  const ext = config['docExtension']
  const docs = util.traverseFiles(docsRoot, ext)
  const snippetRoot = util.getSnippetsRoot(projRoot)

  for (var i in docs) {
    const doc = docs[i]
    const newDoc = await parser.injectCodeSnippet2Doc(doc, function (snippetName) {
      return util.loadFileContent(util.getSnippetFile(snippetRoot, snippetName))
    })

    console.log('write new doc :', newDoc)
  }
}

module.exports = {
  write
}
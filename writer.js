const fs = require('fs')
const path = require('path')
const util = require('./comm/util')
const parser = require('./comm/parser')
const git = require('simple-git')

const write = async function (projRoot) {
  // load global config
  var global = util.loadEntryConfig(projRoot, 'g.json')
  const writeAll = global != null
  if (!global) {
    global = util.loadEntryConfig(path.join(projRoot, '..'), 'g.json')
  }
  if (!global) {
    console.warn('Global Config Not Found.')
    return
  }


  const localGitRepo = path.join(projRoot, 'docRepo')
  await syncWithRemote(global.docsRemoteRepo, localGitRepo)

  // if (writeAll) {
  //   var list = fs.readdirSync(projRoot)
  //   list.forEach(function(file) {
  //       file = path.resolve(root, file)
  //       var stat = fs.statSync(file)
  //       if (stat && stat.isDirectory()) {
  //         await writeSingleLang(file, global)
  //       }
  //   })
  // } else {
  //   await writeSingleLang(projRoot, global)
  // }
}

const writeSingleLang = async function (projRoot, global) {
  // load project config
  const config = util.loadEntryConfig(projRoot, 'cssg.json')
  if (!config) {
    return
  }
  
  const ext = config.docExtension || global.docExtension
  const docs = util.traverseFiles(docsRoot, ext)
  const snippetRoot = util.getSnippetsRoot(projRoot)

  for (var i in docs) {
    const doc = docs[i]
    const newDoc = await parser.injectCodeSnippet2Doc(doc, function (snippetName) {
      return util.loadFileContent(util.getSnippetFile(snippetRoot, snippetName))
    })

    console.log('write doc done :', newDoc)
  }
}

const syncWithRemote = async function (repo, localRoot) {

  console.log('Syncing...')

  return new Promise((resolve, reject) => {
    const gitRepo = git().silent(false)
    if (!fs.existsSync(localRoot)) {
      fs.mkdirSync(localRoot)
      gitRepo.clone(repo, localRoot)
    }
    gitRepo
      .branchLocal((error, summary) => {
        console.log(summary)
      })
      .checkoutBranch('cssg', 'origin/master')
      .pull()
      .exec(() => {
        console.log('Sync with remote end')
        resolve(localRoot)
      })
  })
}

module.exports = {
  write
}

write(path.join(__dirname, "../cssg-cases"))
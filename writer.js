const fs = require('fs')
const path = require('path')
const util = require('./comm/util')
const parser = require('./comm/parser')
const git = require('simple-git')

const write = async function (projRoot) {
  // load global config
  var globalConfigFile = path.join(projRoot, 'g.json')
  var writeAll
  var localRepoRoot

  if (!fs.existsSync(globalConfigFile)) {
    globalConfigFile = path.join(projRoot, '../g.json')
    writeAll = false
    localRepoRoot = path.join(projRoot, '../docRepo')
  } else {
    writeAll = true
    localRepoRoot = path.join(projRoot, 'docRepo')
  }
  if (!fs.existsSync(globalConfigFile)) {
    console.warn('Global Config Not Found.')
    return
  }
  var global = JSON.parse(fs.readFileSync(globalConfigFile))

  await syncWithRemote(global.docsRemoteRepo, localRepoRoot)
  const gitRepo = git(localRepoRoot).silent(false)
  const docsDir = path.join(localRepoRoot, global.docRelativePath)

  if (writeAll) {
    var list = fs.readdirSync(projRoot)
    const projs = []
    list.forEach(function(file) {
        file = path.resolve(projRoot, file)
        var stat = fs.statSync(file)
        if (stat && stat.isDirectory()) {
          projs.push(file)
        }
    })
    for (var i in projs) {
      const changes = await writeSingleProj(projs[i], docsDir, global)
      await addCommit(gitRepo, changes)
    }
  } else {
    const changes = await writeSingleProj(projRoot, docsDir, global)
    await addCommit(gitRepo, changes)
  }
}

const writeSingleProj = async function (projRoot, docsDir, global) {
  // load project config
  var config = path.join(projRoot, 'cssg.json')
  if (!fs.existsSync(config)) {
    return null
  }
  config = JSON.parse(fs.readFileSync(config))
  if (!config.docRoot) {
    console.warn("Please set \"docRoot\" in config file.")
    return null
  }
  const currentSDKDocDir = path.join(docsDir, config.docRoot)
  
  const ext = config.docExtension || global.docExtension
  const docs = util.traverseFiles(currentSDKDocDir, ext)
  const snippetRoot = util.getSnippetsRoot(projRoot)

  const changes = []
  for (var i in docs) {
    const newDoc = await parser.injectCodeSnippet2Doc(docs[i], function (snippetName) {
      const file = util.getSnippetFile(snippetRoot, snippetName)
      if (fs.existsSync(file)) {
        return util.loadFileContent(file)
      }
      return null
    })
    changes.push(newDoc)

    console.log('write doc done :', newDoc)
  }

  return {
    language: config.language,
    changeList: changes,
    sdkDocDir: currentSDKDocDir
  }
}

const syncWithRemote = async function (repo, localRoot) {
  console.log('Syncing...')

  return new Promise((resolve, reject) => {
    var gitRepo
    if (!fs.existsSync(localRoot)) {
      gitRepo = git().silent(false)
      gitRepo.clone(repo, localRoot)
    } else {
      gitRepo = git(localRoot).silent(false)
    }
    const workingBranch = 'cssg-working'
    gitRepo
      .branchLocal((error, summary) => {
        if (summary && summary.branches && summary.branches[workingBranch]) {
          // branch exist
          gitRepo.checkout(workingBranch)
        } else {
          gitRepo.checkoutBranch(workingBranch, 'origin/master')
        }
        gitRepo
          .pull('origin', 'master', {'--rebase': 'true'})
          .exec(() => {
            console.log('Sync with remote end')
            resolve(gitRepo)
          })
      })
  })
}

const addCommit = async function (gitRepo, changes) {
  changes = changes || {}
  if (!changes.language) {
    return
  }

  return new Promise((resolve, reject) => {
    gitRepo.diffSummary((error, summary) => {
      if (summary && summary.files && summary.files.length > 0) {
        gitRepo.add(changes.sdkDocDir)
        const message = `Update COS ${changes.language} sdk doc ${new Date().toISOString()}`
        // gitRepo.commit(message)
        console.log("Add 1 commit :", message)
      } else {
        console.log("No changes Applied")
      }
      gitRepo.exec(() => {
        resolve(1)
      })
    })
  })
}

module.exports = {
  write
}
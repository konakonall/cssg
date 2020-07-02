const git = require('simple-git')
const fs = require('fs-extra')

const syncRemoteRepo = function (repo, localRoot) {
  console.log(`Syncing from ${repo}...`)
  

  return new Promise((resolve, reject) => {
    var gitRepo
    if (fs.existsSync(localRoot)) {
      fs.removeSync(localRoot)
    } else {
      // gitRepo = git(localRoot).silent(false)
      // gitRepo.pull('origin', 'master', {'--rebase': 'true'})
    }
    gitRepo = git().silent(false)
    gitRepo.clone(repo, localRoot)
    gitRepo.exec(() => {
      console.log(`Sync to ${localRoot} end.`)
      resolve(gitRepo)
    })
  })
}

module.exports = {
  syncRemoteRepo
}
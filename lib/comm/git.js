const git = require('simple-git')
const fs = require('fs')

const syncRemoteRepo = function (repo, localRoot) {
  console.log('Syncing...')

  return new Promise((resolve, reject) => {
    var gitRepo
    if (!fs.existsSync(localRoot)) {
      gitRepo = git().silent(false)
      gitRepo.clone(repo, localRoot)
    } else {
      gitRepo = git(localRoot).silent(false)
      gitRepo.pull('origin', 'master', {'--rebase': 'true'})
    }
    gitRepo.exec(() => {
      console.log(`Sync ${repo} end.`)
      resolve(gitRepo)
    })
  })
}

module.exports = {
  syncRemoteRepo
}
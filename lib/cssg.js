var path = require('path');
const fs = require('fs-extra');
const util = require('./comm/util');
const git = require('./comm/git')
const request = require('request')

const globalConfigUrl = 'https://raw.githubusercontent.com/konakonall/cssg/master/g.json'
const langConfigUrl = 'https://raw.githubusercontent.com/konakonall/cssg/master/conf/${lang}.json'
const cssgRepoUrl = 'https://github.com/konakonall/cssg'

const fetchRemoteJSONConfig = function(url) {
  return new Promise((resolve, reject) => {
    request(url, function (error, response, data) {
      if (!error && data) {
        resolve(JSON.parse(data))
      } else {
        reject(error)
      }
    })
  })
}

const getLocalConf = function() {
  const homedir = require('os').homedir();
  const confFilePath = path.join(homedir, '.cssg.json')
  if (fs.existsSync(confFilePath)) {
    return JSON.parse(util.loadFileContent(confFilePath))
  }
  return null
}

/**
 * 初始化配置文件
 * @param {string} homePath 
 */
const init = function(homePath) {
  const homedir = require('os').homedir();
  const confFilePath = path.join(homedir, '.cssg.json')
  var config = {}
  if (fs.existsSync(confFilePath)) {
    config = JSON.parse(util.loadFileContent(confFilePath))
  }
  config.home = path.join(process.cwd(), homePath)

  console.log('CSSG init with config:', config)
  fs.writeFileSync(confFilePath, JSON.stringify(config))
  console.log('CSSG config saved to :', confFilePath)
}

/**
 * 读取全局配置
 */
const globalConfig = async function() {
  const localConf = getLocalConf();
  if (localConf != null && localConf.home) {
    const globalConfFile = path.join(localConf.home, 'g.json')
    if (fs.existsSync(globalConfFile)) {
      console.log('CSSG load global config from home:', localConf.home)
      return JSON.parse(util.loadFileContent(globalConfFile))
    }
  }
  
  console.log(`CSSG fetch config from ${globalConfigUrl}...`)

  try {
    return await fetchRemoteJSONConfig(globalConfigUrl)
  } catch(e) {
    console.error(e)
    return null
  }
}

/**
 * 读取语言配置
 */
const langConfig = async function(lang) {
  const localConf = getLocalConf();
  if (localConf != null && localConf.home) {
    const confFile = path.join(localConf.home, 'conf', lang + '.json')
    if (fs.existsSync(confFile)) {
      console.log(`CSSG load ${lang} config from home:`, localConf.home)
      return JSON.parse(util.loadFileContent(confFile))
    }
  }
  
  console.log(`CSSG fetch config from ${langConfigUrl}...`)

  try {
    return await fetchRemoteJSONConfig(`${langConfigUrl}`)
  } catch(e) {
    console.error(e)
    return null
  }
}

const prepareLocalRepo = async function() {
  const localConf = getLocalConf();
  if (localConf != null && localConf.home) {
    console.log(`CSSG find home repo: `, localConf.home)
    return {
      home: localConf.home,
      temp: false
    }
  }

  const tempDir = path.join(process.cwd(), '.temp', 'cssg')
  if (fs.existsSync(tempDir)) {
    fs.removeSync(tempDir)
  }
  fs.mkdirsSync(tempDir, { recursive: true })

  console.log(`CSSG start sync ${cssgRepoUrl}...`)
  await git.syncRemoteRepo(cssgRepoUrl, tempDir)
  console.log(`CSSG sync home repo:`, tempDir)
  return {
    home: tempDir,
    temp: true
  }
}

const prepareLocalLanguageRepo = async function(lang, remoteRepoUrl) {
  const localConf = getLocalConf();
  if (localConf != null && localConf[lang + '_home']) {
    const langHome = localConf[lang + '_home']
    console.log(`CSSG find ${lang} repo: `, langHome)
    return {
      home: langHome,
      temp: false
    }
  }

  const tempDir = path.join(process.cwd(), '.temp', lang)
  if (fs.existsSync(tempDir)) {
    fs.removeSync(tempDir)
  }
  fs.mkdirsSync(tempDir, { recursive: true })

  remoteRepoUrl = remoteRepoUrl + '.git'
  console.log(`CSSG start sync ${remoteRepoUrl}...`)
  await git.syncRemoteRepo(remoteRepoUrl, tempDir)
  console.log(`CSSG sync ${lang} repo:`, tempDir)
  return {
    home: tempDir,
    temp: true
  }
}

module.exports = {
  init,
  globalConfig,
  langConfig,
  prepareLocalRepo,
  prepareLocalLanguageRepo
}
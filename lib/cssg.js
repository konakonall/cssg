var path = require('path');
const fs = require('fs-extra');
const util = require('./comm/util');

/**
 * 初始化配置文件
 * @param {string} localPath 
 */
const init = function(localPath) {
  const homedir = require('os').homedir();
  const confFilePath = path.join(homedir, '.cssg.json')
  var config = {}
  if (fs.existsSync(confFilePath)) {
    config = JSON.parse(util.loadFileContent(confFilePath))
  }
  config['confPath'] = path.join(process.cwd(), localPath)

  console.log('CSSG init with config:', config)
  fs.writeFileSync(confFilePath, JSON.stringify(config))
  console.log('CSSG config file saved to :', confFilePath)
}

/**
 * 读取配置
 */
const config = function() {
  const homedir = require('os').homedir();
  const confFilePath = path.join(homedir, '.cssg.json')
  if (fs.existsSync(confFilePath)) {
    return JSON.parse(util.loadFileContent(confFilePath))
  }
  return null
}

module.exports = {
  init,
  config
}
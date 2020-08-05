const fs = require('fs-extra');
var path = require('path');
var parser = require('./comm/parser');
const util = require('./comm/util');
const cssg = require('./cssg');
const { boolean } = require('yargs');

const stat = async function(projRoot) {
  const configFile = path.join(projRoot, 'cssg.json')
  if (!fs.existsSync(configFile)) {
    console.warn(`Error: 当前目录找不到 cssg.json 配置文件`)
    return
  }

  const config = JSON.parse(fs.readFileSync(configFile));
  console.log('CSSG load config :', config)

  parser.setCommentDelimiter(config.commentDelimiter)

  const globalConfig = await cssg.globalConfig()

  const snippetNameCommonPrefix = config.snippetNameCommonPrefix

  const methods = []
  const descriptions = {}
  for (var name in globalConfig.groups) {
    for (var i in globalConfig.groups[name].methods) {
      const m = globalConfig.groups[name].methods[i]
      methods.push(m.name)
      descriptions[m.name] = m.desc
    }
  }

  const caseRoot = path.join(projRoot, config.caseRelativePath)
  // 抽取代码段
  const sourceFiles = util.traverseFiles(caseRoot, config.sourceExtension)
  for (var i in sourceFiles) {
    const subSnippets = await parser.getSnippetsFromCase(sourceFiles[i])
    for (var j in subSnippets) {
      const snippet = subSnippets[j]
      if (snippetNameCommonPrefix) {
        snippet.name = snippet.name.replace(snippetNameCommonPrefix, '')
      }
      const index = methods.indexOf(snippet.name)
      if(index >= 0) {
        console.log('√', snippet.name)
        methods.splice(index, 1)
      } else {
        console.log('√√', snippet.name)
      }
    }
  }
  console.log('\n')
  for (var i in methods) {
    console.log('×', methods[i], '  ', descriptions[methods[i]])
  }
}


module.exports = {
    stat
}
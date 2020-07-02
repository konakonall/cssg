const fs = require('fs-extra');
var path = require('path');
var parser = require('./comm/parser');
const mustache = require('mustache');
const util = require('./comm/util');
const pretty = require('./comm/pretty');

/**
 * 创建一个新的代码文件
 * 
 * @param {*} projRoot 
 * @param {*} lang 
 * @param {*} template 
 * @param {*} group_name 
 */
const create = async function(projRoot, lang, template, group_name) {
  // 全局配置文件
  var globalConfigFile = 'g.json'

  if (!fs.existsSync(globalConfigFile)) {
    console.warn('Error: Global Config Not Found.')
    return
  } 

  const global = JSON.parse(fs.readFileSync(globalConfigFile))

  const pl = path.join('conf', lang + '.json')
  if (!fs.existsSync(pl)) {
    console.warn(`Error: Unrecognize language:  ${lang}`)
    return
  }
  const plConf = JSON.parse(fs.readFileSync(pl));
  const config = Object.assign(global, plConf)
  console.log('CSSG Compiler load config :', config)

  parser.setCommentDelimiter(config.commentDelimiter)
  
  const className = util.getNameByConvension(group_name, 
    config.classNamingConvention)

  const values = {
    name: className,
    methods: []
  }

  for (var i in config.groups[group_name].methods) {
    const m = config.groups[group_name].methods[i]
    const name = m.name
    values.methods.push({
      name: util.getNameByConvension(name, config.methodNamingConvention),
      description: m.desc,
      startTag: parser.getSnippetBodyCommentStart(name),
      endTag: parser.getSnippetBodyCommentEnd(name),
    })
  }

  const code = mustache.render(util.loadFileContent(template), values)

  const sourceFileName = util.getNameByConvension(group_name, 
    config.sourceFileNamingConvention)
  const destination = path.join(projRoot, config.caseRelativePath)
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true })
  }

  const sourceFile = path.join(destination, sourceFileName + 
    config.sourceExtension)
  util.saveFile(sourceFile, code)
  
  console.log('Generate source file:', sourceFile)
}

module.exports = {
  create
}

// const lang = "android"
// const template = "/Users/wjielai/Workspace/qcloud-sdk-android/Demo/Example.t"
// const projRoot = "/Users/wjielai/Workspace/qcloud-sdk-android/"

// create(projRoot, lang, template, "object-tagging")
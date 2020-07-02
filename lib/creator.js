const fs = require('fs-extra');
var path = require('path');
var parser = require('./comm/parser');
const mustache = require('mustache');
const util = require('./comm/util');
const pretty = require('./comm/pretty');
const cssg = require('./cssg')

/**
 * 创建一个新的代码文件
 * 
 * @param {*} projRoot 
 * @param {*} lang 
 * @param {*} template 
 * @param {*} group_name 
 */
const add = async function(projRoot, group_name) {
  const templateFile = path.join(projRoot, 'Example.t')
  if (!fs.existsSync(templateFile)) {
    console.warn(`Error: 当前目录找不到 Example.t 模版文件`)
    return
  }
  const template = util.loadFileContent(templateFile)

  const configFile = path.join(projRoot, 'cssg.json')
  if (!fs.existsSync(configFile)) {
    console.warn(`Error: 当前目录找不到 cssg.json 配置文件`)
    return
  }
  const config = JSON.parse(fs.readFileSync(configFile));
  console.log('CSSG load config :', config)

  parser.setCommentDelimiter(config.commentDelimiter)
  
  const className = util.getNameByConvension(group_name, 
    config.classNamingConvention)

  const values = {
    name: className,
    methods: []
  }

  const globalConfig = await cssg.globalConfig()
  const methods = globalConfig.groups[group_name].methods
  console.log('CSSG get method list:', methods)

  for (var i in methods) {
    const m = methods[i]
    const name = m.name
    values.methods.push({
      name: util.getNameByConvension(name, config.methodNamingConvention),
      description: m.desc,
      startTag: parser.getSnippetBodyCommentStart(name),
      endTag: parser.getSnippetBodyCommentEnd(name),
    })
  }

  const code = mustache.render(template, values)

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
  add
}
const fs = require('fs-extra');
var path = require('path');
var parser = require('./comm/parser');
const mustache = require('mustache');
const util = require('./comm/util');
const pretty = require('./comm/pretty');

/**
 * 使用文档里的代码片段生成示例代码文件 
 * @param {*} docSetRoot  
 * @param {*} projRoot  
 * @param {*} lang  
 * @param {*} template  
 */
const build = async function (docSetRoot, projRoot, lang, template) {
  console.log('CSSG Compiler start:\n----------------- ')

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
  const config = Object.assign(plConf, global)
  console.log('CSSG Compiler load config :', config)

  const destination = path.join(projRoot, config.caseRelativePath)
  await extractAll(docSetRoot, config, destination, template)

  console.log('CSSG Compiler end:\n----------------- ')

}

const extractAll = async function (sdkDocSetRoot, config, destination, template) {
  // create destination dir if necessary
  if (fs.existsSync(destination)) {
    fs.removeSync(destination)
  }
  fs.mkdirSync(destination, { recursive: true })

  // lookup Documents
  const documents = util.traverseFiles(sdkDocSetRoot, config.docExtension)

  // 抽取代码段
  const snippets = []
  for (var i in documents) {
    const subSnippets = await parser.getSnippetsFromDoc(documents[i])
    const matchedSnippets = []
    for (var j in subSnippets) {
      const snippet = subSnippets[j]
      matchedSnippets.push(snippet)
    }
    Array.prototype.push.apply(snippets, matchedSnippets)
  }

  // 生成映射表
  const snippetNameDic = {}
  for (var i in snippets) {
    const snippet = snippets[i]
    if (snippet.name) {
      snippetNameDic[snippet.name] = snippet
    }
  }

  // template file content
  const templateContent = util.loadFileContent(template)
  // 记录模版对应的代码缩进值
  const indentation = util.getSnippetIndentation(templateContent)

  // set comment delimiter
  parser.setCommentDelimiter(config.commentDelimiter)

  for (var groupName in config.groups) {
    const group = config.groups[groupName]
    const methods = group.methods

    // 方法列表
    const filterM = []
    for (var i in methods) {
      const m = methods[i]
      if (snippetNameDic.hasOwnProperty(m.name)) {
        filterM.push(Object.assign({
          snippet: snippetNameDic[m.name]
        }, m))
      } else {
        console.warn('Warn: Not found snippet for', m.name)
      }
    }

    const pipeline = {
      name: groupName,
      methods: filterM
    }
    // 生成示例文件
    extractExample(pipeline, {
      template: templateContent,

      sourceExtension: config.sourceExtension, 
      indentation,
      destination,
      
      sourceFileNamingConvention: config.sourceFileNamingConvention, 
      methodNamingConvention: config.methodNamingConvention, 
      classNamingConvention: config.classNamingConvention
    })
  }

}

const extractExample = function (pipeline, option) {
  const className = util.getNameByConvension(pipeline.name, option.classNamingConvention)

  const values = {
    name: className,
    methods: []
  }

  for (var i in pipeline.methods) {
    const method = pipeline.methods[i]
    const snippet = method.snippet
    const name = method.name

    values.methods.push({
      name: util.getNameByConvension(name, option.methodNamingConvention),
      description: method.desc,
      startTag: parser.getSnippetBodyCommentStart(name),
      endTag: parser.getSnippetBodyCommentEnd(name),
      snippet: pretty.prettyCodeBlock(snippet.bodyBlock, option.indentation)
    })
  }

  const code = mustache.render(option.template, values)

  const sourceFileName = util.getNameByConvension(pipeline.name, option.sourceFileNamingConvention)
  const sourceFile = path.join(option.destination, sourceFileName + option.sourceExtension)
  util.saveFile(sourceFile, code)
  
  console.log('Generate source file:', sourceFile)
}

module.exports = {
  build
}

const docsetRoot = "/Users/laiwenjie/Workspace/cssg-cases/docRepo/product/存储与CDN/对象存储\ 4.0/SDK文档/Android\ SDK"
const lang = "android"
const template = "/Users/wjielai/Workspace/qcloud-sdk-android/Demo/Example.t"
const projRoot = "/Users/wjielai/Workspace/qcloud-sdk-android/"

build(docsetRoot, projRoot, lang, template)
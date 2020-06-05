const fs = require('fs-extra');
var path = require('path');
var parser = require('./comm/parser');
const mustache = require('mustache');
const util = require('./comm/util');
const pretty = require('./comm/pretty');

/**
 * 使用文档里的代码片段生成示例代码文件 
 * @param {*} docSetRoot  
 * @param {*} destination  
 * @param {*} lang  
 * @param {*} template  
 */
const build = async function (docSetRoot, destination, lang, template) {
  console.log('CSSG Compiler start:\n----------------- ')

  // 全局配置文件
  var globalConfigFile = 'g.json'

  if (!fs.existsSync(globalConfigFile)) {
    console.warn('Error: Global Config Not Found.')
    return
  }

  const global = JSON.parse(fs.readFileSync(globalConfigFile))

  const pl = global.langs[lang];
  if (!pl) {
    console.warn(`Error: Unrecognize language:  ${lang}`)
    return
  }
  const config = Object.assign(pl, global)
  console.log('CSSG Compiler load config :', config)

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

  for (var groupName in config.groups) {
    const group = config.groups[groupName]
    const pipeline = {
      name: groupName
    }
    if (Array.isArray(group)) {
      // 方法列表
      const gs = []
      for (var i in group) {
        if (snippetNameDic.hasOwnProperty(group[i])) {
          gs.push(snippetNameDic[group[i]])
        }
      }
      pipeline[groupName] = gs
    } else {
      pipeline[groupName] = [snippetNameDic[group]]
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

  const caseName = pipeline.name
  delete pipeline.name

  const values = {
    name: className,
    methods: []
  }

  for (let key in pipeline) {
    if (pipeline.hasOwnProperty(key)) {
      const gs = pipeline[key]
      if (Array.isArray(gs)) {
        for (let i in gs) {
          const snippet = gs[i]
          const name = snippet.name
          const methodObj = {
            name: util.getNameByConvension(name, option.methodNamingConvention)
          }
          methodObj.snippet = pretty.prettyCodeBlock(snippet.bodyBlock, option.indentation)
          values.methods.push(methodObj)
        }
      }
    }
  }

  const code = mustache.render(option.template, values)

  const sourceFileName = util.getNameByConvension(caseName, option.sourceFileNamingConvention)
  const sourceFile = path.join(option.destination, sourceFileName + option.sourceExtension)
  util.saveFile(sourceFile, code)
  
  console.log('generate souce file :', sourceFile)
}

module.exports = {
  build
}

const docsetRoot = "/Users/laiwenjie/workspace/qcloud-documents/product/存储与CDN/对象存储\ 4.0/SDK文档/Android\ SDK"
const lang = "android"
const template = "/Users/laiwenjie/workspace/cssg-cases/Android/TestCase.t"

build(docsetRoot, path.join(process.cwd(), "example"), lang, template)
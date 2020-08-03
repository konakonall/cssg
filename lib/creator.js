const fs = require('fs-extra');
var path = require('path');
var parser = require('./comm/parser');
const mustache = require('mustache');
const util = require('./comm/util');
const pretty = require('./comm/pretty');
const cssg = require('./cssg');
const { basename, parse } = require('path');


/**
 * 同步模版配置到工程中，自动补齐缺失的用例
 * 
 * @param {string} projRoot 
 */
const sync = async function(projRoot) {
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

  const globalConfig = await cssg.globalConfig()

  // source file extension
  const extension = config.sourceExtension

  // 代码块名称通用前缀
  const snippetNameCommonPrefix = config.snippetNameCommonPrefix

  const sourceFiles = util.traverseFiles(path.join(projRoot, 
    config.caseRelativePath), extension)

  for (var name in globalConfig.groups) {
    // class 名称
    const className = util.getNameByConvension(name, config.classNamingConvention)
    // 文件 名称
    const sourceFileName = util.getNameByConvension(name, 
      config.sourceFileNamingConvention)
    // 目标存放路径
    const destination = path.join(projRoot, config.caseRelativePath)
  
    const values = {
      name: className,
      methods: []
    }
    const methods = globalConfig.groups[name].methods
    for (var i in methods) {
      const m = methods[i]
      const name = m.name
      values.methods.push({
        tag: (snippetNameCommonPrefix || '') + name,
        name: util.getNameByConvension(name, config.methodNamingConvention),
        description: m.desc,
        startTag: parser.getSnippetBodyCommentStart((snippetNameCommonPrefix || '') + name),
        endTag: parser.getSnippetBodyCommentEnd(name),
      })
    }

    let isFresh = true
    for (var i in sourceFiles) {
      const fileName = path.basename(sourceFiles[i]).replace(
        config.sourceExtension, '')
      if (sourceFileName == fileName) {
        await smartMerge(destination, sourceFileName, template, values, config);
        isFresh = false
        break
      }
    }
    if (isFresh) {
      const newFile = await add(destination, sourceFileName, template, values, config)

      const methods = globalConfig.groups[name].methods
      for (var i in methods) {
        console.log(`增加新用例   [${methods[i].name}]     in ${newFile}`)
      }
    }
  }

}

/**
 * 创建一个新的代码文件
 * 
 * @param {*} destination 
 * @param {*} sourceFileName 
 * @param {*} codeContent 
 * @param {*} config 
 */
const add = async function(destination, sourceFileName, template, values, config) {
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true })
  }
  const code = mustache.render(template, values)

  const sourceFile = path.join(destination, sourceFileName + 
    config.sourceExtension)
  util.saveFile(sourceFile, code)

  return sourceFile
}

const smartMerge = async function(destination, sourceFileName, template, values, config) {
  if (!fs.existsSync(destination)) {
    return []
  }
  const sourceFile = path.join(destination, sourceFileName + 
    config.sourceExtension)
  const fileContent = util.loadFileContent(sourceFile)
  const tags = parser.findAllTagsFromCases(fileContent)
  const newMethods = []
  for (let i in values.methods) {
    if (tags.indexOf(values.methods[i].tag) < 0) {
      newMethods.push(values.methods[i])
    }
  }
  // filter methods
  values.methods = newMethods;

  if (newMethods.length > 0) {
    const regex1 = RegExp('\\{{2,3}#methods\\}{2,3}[^]+?\\{{2,3}\/methods\\}{2,3}','g');
    let array1
    const newMethodsContents = []
    while ((array1 = regex1.exec(template)) !== null) {
      const methodsContentTemplate = array1[0]
      newMethodsContents.push(mustache.render(methodsContentTemplate, values))
    }
    for (var i in newMethods) {
      console.log(`增加新用例   [${newMethods[i].tag}]     in ${sourceFile}`)
    }
  
    const newFileContent = await parser.mergeDiffToContent(fileContent, newMethodsContents);
  
    if (newFileContent) {
      util.saveFile(sourceFile, newFileContent)
    }
  }

}


/**
 * 使用文档里的代码片段生成示例代码文件 
 * 
 * @param {*} docSetRoot  
 * @param {*} lang  
 * @param {*} template  
 */
const compile = async function(projRoot, docSetRoot, lang) {
  console.log('CSSG Compiler start:\n----------------- ')

  // 全局配置文件
  const global = await cssg.globalConfig()

  // 语言配置文件
  const plConf = await cssg.langConfig(lang)
  if (!plConf) {
    console.warn(`Error: Unrecognize language:  ${lang}`)
    return
  }
  const templateFile = path.join(projRoot, 'Example.t')
  if (!fs.existsSync(templateFile)) {
    console.warn(`Error: 当前目录找不到 Example.t 模版文件`)
    return
  }
  const template = util.loadFileContent(templateFile)

  // 语言配置文件2
  const langConf = path.join(projRoot, 'cssg.json')
  if (!fs.existsSync(langConf)) {
    console.warn(`Error: 当前目录找不到 cssg.json 配置文件`)
    return
  }

  const config = Object.assign(global, plConf, JSON.parse(
    util.loadFileContent(langConf)))
  console.log('CSSG Compiler load config :', config)

  const destination = path.join(projRoot, config.caseRelativePath)
  docSetRoot = path.join(docSetRoot, config.documentRelativePath)
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
      if (config.snippetNameCommonPrefix) {
        // 匹配前缀
        if (snippet.name.startsWith(config.snippetNameCommonPrefix)) {
          snippet.name = snippet.name.replace(config.snippetNameCommonPrefix, '')
          matchedSnippets.push(snippet)
        }
      } else {
        matchedSnippets.push(snippet)
      }
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

  // 记录模版对应的代码缩进值
  const indentation = util.getSnippetIndentation(template)

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
        filterM.push(m)
      }
    }

    const pipeline = {
      name: groupName,
      methods: filterM
    }
    // 生成示例文件
    extractExample(pipeline, {
      template,

      sourceExtension: config.sourceExtension, 
      indentation,
      destination,
      snippetNameCommonPrefix: config.snippetNameCommonPrefix,
      
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
      startTag: parser.getSnippetBodyCommentStart(
        addNameCommonPrefix(option.snippetNameCommonPrefix, name)),
      endTag: parser.getSnippetBodyCommentEnd(
        addNameCommonPrefix(option.snippetNameCommonPrefix, name)),
      snippet: snippet ? pretty.prettyCodeBlock(snippet.bodyBlock, option.indentation) : null
    })
  }

  const code = mustache.render(option.template, values)

  const sourceFileName = util.getNameByConvension(pipeline.name, option.sourceFileNamingConvention)
  const sourceFile = path.join(option.destination, sourceFileName + option.sourceExtension)
  util.saveFile(sourceFile, code)
  
  console.log('Generate source file:', sourceFile)
}

const addNameCommonPrefix = function(commonPrefix, name) {
  if (commonPrefix) {
    return commonPrefix + name
  }
  return name
}

module.exports = {
  add,
  compile,
  sync
}
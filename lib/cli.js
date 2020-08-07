#!/usr/bin/env node

const creator = require('./creator')
const writer = require('./writer')
const cssg = require('./cssg')
const validator = require('./validator')

/**
 * Usage:
 * 
 * 初始化配置
 * 
 * cssg init [path to cssg root]
 * 
 * 打印当前配置
 * 
 * cssg config
 * 
 * 生成官网文档
 * 
 * cd [qcloud-documents 仓库根目录]
 * cssg write [编程语言]
 * 支持拼接多个编程语言：例如 objc+swift
 * 
 * 添加新用例
 * 
 * cd [cssg.json 所在目录]
 * cssg add [用例名称]
 * 
 * 从文档批量生成用例
 * 
 * cd [cssg.json 所在目录]
 * cssg compile [qcloud-documents 仓库根目录] [编程语言]
 *  
 */
const args = require('yargs')
  .command('config', 'show local config', (yargs) => {
  }, (argv) => {
    console.log(cssg.getLocalConf())
  })
  .command('init [path]', 'init cssg config', (yargs) => {
    yargs
      .demandOption(['path'])
      .describe({
        path: '本地配置文件目录'
      })
  }, (argv) => {
    cssg.init(argv.path)
  })
  .command('write [lang]', 'write Document', (yargs) => {
    yargs
      .demandOption(['lang'])
      .describe({
        lang: 'SDK语言'
      })
  }, (argv) => {
    writer.write(process.cwd(), argv.lang)
  })
  .command('syncSnippet [lang]', 'syncSnippet snippet to docs', (yargs) => {
    yargs
      .demandOption(['lang'])
      .describe({
        lang: 'SDK语言'
      })
  }, (argv) => {
    writer.syncSnippet(process.cwd(), argv.lang)
  })
  .command('add [name]', 'generate new test case from template', (yargs) => {
    yargs
      .demandOption(['name'])
      .describe({
        name: 'Case 名称'
      })
  }, (argv) => {
    creator.add(process.cwd(), argv.name)
  })
  .command('sync', 'Sync with tempalte', (yargs) => {
  }, (argv) => {
    creator.sync(process.cwd())
  })
  .command('stat', 'Get Code Snippet Statistic', (yargs) => {
  }, (argv) => {
    validator.stat(process.cwd())
  })
  .command('compile [docset] [lang]', 'generate new test case from template', (yargs) => {
    yargs
      .demandOption(['docset', 'lang'])
      .describe({
        docset: 'qcloud 文档仓库本地路径',
        lang: 'SDK语言'
      })
  }, (argv) => {
    creator.compile(process.cwd(), argv.docset, argv.lang)
  })
  .argv

  


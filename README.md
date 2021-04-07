# cssg

Tool for generating SDK documents for [Tencent COS](https://cloud.tencent.com/document/product/436).

`cssg` stands for `COS SDK Snippet Generator`.

## Usage 

### 初始化配置

```
cssg init [path to cssg root]
```

### 打印当前配置

```
cssg config
```

### 生成官网文档

```
cd [qcloud-documents 仓库根目录]
# 支持拼接多个编程语言：例如 objc+swift
cssg write [编程语言]
```

### 添加新用例

```
cd [cssg.json 所在目录]
cssg add [用例名称]
```

### 从文档批量生成用例

```
cd [cssg.json 所在目录]
cssg compile [qcloud-documents 仓库根目录] [编程语言]
```

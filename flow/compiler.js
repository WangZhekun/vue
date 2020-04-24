declare type CompilerOptions = {
  warn?: Function; // 定制不同的环境的警告方法；allow customizing warning in different environments;  e.g. node
  modules?: Array<ModuleOptions>; // 平台的特殊模块的配置；platform specific modules;  e.g. style; class
  directives?: { [key: string]: Function }; // 平台的特殊指令；platform specific directives
  staticKeys?: string; // a list of AST properties to be considered static; for optimization
  isUnaryTag?: (tag: string) => ?boolean; // 标签在平台上是否是一元的 check if a tag is unary for the platform
  canBeLeftOpenTag?: (tag: string) => ?boolean; // check if a tag can be left opened
  isReservedTag?: (tag: string) => ?boolean; // 标签在平台上是否是原生的 check if a tag is a native for the platform
  preserveWhitespace?: boolean; // 是否保留节点之间的空白 preserve whitespace between elements? (Deprecated)
  whitespace?: 'preserve' | 'condense'; // 空白处理策略 whitespace handling strategy
  optimize?: boolean; // 是否优化静态内容 optimize static content?

  // web specific
  mustUseProp?: (tag: string, type: ?string, name: string) => boolean; // 特性（attribute）是否需要被绑定为属性（property） check if an attribute should be bound as a property
  isPreTag?: (attr: string) => ?boolean; // 标签是否需要保留空白 check if a tag needs to preserve whitespace
  getTagNamespace?: (tag: string) => ?string; // 检查标签的命名空间 check the namespace for a tag
  expectHTML?: boolean; // 仅非web编译时为false only false for non-web builds
  isFromDOM?: boolean;
  shouldDecodeTags?: boolean;
  shouldDecodeNewlines?:  boolean;
  shouldDecodeNewlinesForHref?: boolean;
  outputSourceRange?: boolean;

  // 运行时用户配置 runtime user-configurable
  delimiters?: [string, string]; // 改变纯文本插入分隔符。 template delimiters
  comments?: boolean; // 是否保留模板中的注释 preserve comments in template

  // 服务端渲染的优化编译 for ssr optimization compiler
  scopeId?: string;
};

declare type WarningMessage = {
  msg: string;
  start?: number;
  end?: number;
};

declare type CompiledResult = {
  ast: ?ASTElement;
  render: string;
  staticRenderFns: Array<string>;
  stringRenderFns?: Array<string>;
  errors?: Array<string | WarningMessage>;
  tips?: Array<string | WarningMessage>;
};

declare type ModuleOptions = {
  // transform an AST node before any attributes are processed
  // returning an ASTElement from pre/transforms replaces the element
  preTransformNode: (el: ASTElement) => ?ASTElement;
  // transform an AST node after built-ins like v-if, v-for are processed
  transformNode: (el: ASTElement) => ?ASTElement;
  // transform an AST node after its children have been processed
  // cannot return replacement in postTransform because tree is already finalized
  postTransformNode: (el: ASTElement) => void;
  genData: (el: ASTElement) => string; // generate extra data string for an element
  transformCode?: (el: ASTElement, code: string) => string; // further transform generated code for an element
  staticKeys?: Array<string>; // AST properties to be considered static
};

declare type ASTModifiers = { [key: string]: boolean };
declare type ASTIfCondition = {
  exp: ?string; // 条件指令的表达式
  block: ASTElement // 条件指令的v-if所在的ASTElement
};
declare type ASTIfConditions = Array<ASTIfCondition>; // 条件列表

declare type ASTAttr = {
  name: string;
  value: any;
  dynamic?: boolean;
  start?: number;
  end?: number
};

declare type ASTElementHandler = {
  value: string;
  params?: Array<any>;
  modifiers: ?ASTModifiers;
  dynamic?: boolean;
  start?: number;
  end?: number;
};

declare type ASTElementHandlers = {
  [key: string]: ASTElementHandler | Array<ASTElementHandler>;
};

declare type ASTDirective = {
  name: string;
  rawName: string;
  value: string;
  arg: ?string;
  isDynamicArg: boolean;
  modifiers: ?ASTModifiers;
  start?: number;
  end?: number;
};

declare type ASTNode = ASTElement | ASTText | ASTExpression;

declare type ASTElement = {
  type: 1; // 节点类型
  tag: string; // HTML节点名称
  attrsList: Array<ASTAttr>; // 属性列表
  attrsMap: { [key: string]: any }; // 属性映射表
  rawAttrsMap: { [key: string]: ASTAttr }; // 未处理的属性映射表
  parent: ASTElement | void; // 父节点
  children: Array<ASTNode>; // 子节点

  start?: number;
  end?: number;

  processed?: true;

  static?: boolean; // 是否为静态节点
  staticRoot?: boolean; // 是否为静态根节点，即当前节点为静态节点，且只包含一个子节点，子节点为文本节点
  staticInFor?: boolean; // 是否为在v-for内的静态或只动态渲染一次的节点
  staticProcessed?: boolean;
  hasBindings?: boolean;

  text?: string;
  attrs?: Array<ASTAttr>;
  dynamicAttrs?: Array<ASTAttr>;
  props?: Array<ASTAttr>;
  plain?: boolean; // 该节点不包含属性，纯节点
  pre?: true; // 是否跳过这个元素和它的子元素的编译过程
  ns?: string; // HTML标签的命名空间

  component?: string;
  inlineTemplate?: true;
  transitionMode?: string | null;
  slotName?: ?string; // 插槽名
  slotTarget?: ?string; // slot属性的绑定值
  slotTargetDynamic?: boolean; // 插槽名为动态绑定的
  slotScope?: ?string; // 插槽名，slot-scope或scope属性的值
  scopedSlots?: { [name: string]: ASTElement }; // 多个具名插槽的Map，name为插槽名，ASTElement为子节点

  ref?: string;
  refInFor?: boolean;

  if?: string; // v-if的表达式
  ifProcessed?: boolean;
  elseif?: string; // v-else-if的表达式
  else?: true; // v-else的标志
  ifConditions?: ASTIfConditions; // 节点的渲染条件

  for?: string; // in/of后的部分
  forProcessed?: boolean;
  key?: string;
  alias?: string; // in/of前，将()去除
  iterator1?: string; // 遍历器
  iterator2?: string; // 索引

  staticClass?: string;
  classBinding?: string;
  staticStyle?: string;
  styleBinding?: string;
  events?: ASTElementHandlers;
  nativeEvents?: ASTElementHandlers;

  transition?: string | true;
  transitionOnAppear?: boolean;

  model?: {
    value: string;
    callback: string;
    expression: string;
  };

  directives?: Array<ASTDirective>;

  forbidden?: true;
  once?: true;
  onceProcessed?: boolean;
  wrapData?: (code: string) => string;
  wrapListeners?: (code: string) => string;

  // 2.4 ssr optimization
  ssrOptimizability?: number;

  // weex specific
  appendAsTree?: boolean;
};

declare type ASTExpression = {
  type: 2;
  expression: string;
  text: string;
  tokens: Array<string | Object>;
  static?: boolean;
  // 2.4 ssr optimization
  ssrOptimizability?: number;
  start?: number;
  end?: number;
};

declare type ASTText = {
  type: 3;
  text: string;
  static?: boolean;
  isComment?: boolean;
  // 2.4 ssr optimization
  ssrOptimizability?: number;
  start?: number;
  end?: number;
};

// SFC-parser related declarations

// an object format describing a single-file component
declare type SFCDescriptor = {
  template: ?SFCBlock;
  script: ?SFCBlock;
  styles: Array<SFCBlock>;
  customBlocks: Array<SFCBlock>;
  errors: Array<string | WarningMessage>;
}

declare type SFCBlock = {
  type: string;
  content: string;
  attrs: {[attribute:string]: string};
  start?: number;
  end?: number;
  lang?: string;
  src?: string;
  scoped?: boolean;
  module?: string | boolean;
};

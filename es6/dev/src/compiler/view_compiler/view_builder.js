import { isPresent, StringWrapper } from 'angular2/src/facade/lang';
import { ListWrapper, StringMapWrapper, SetWrapper } from 'angular2/src/facade/collection';
import * as o from '../output/output_ast';
import { Identifiers, identifierToken } from '../identifiers';
import { ViewConstructorVars, InjectMethodVars, DetectChangesVars, ViewTypeEnum, ViewEncapsulationEnum, ChangeDetectionStrategyEnum, ViewProperties } from './constants';
import { ChangeDetectionStrategy, isDefaultChangeDetectionStrategy } from 'angular2/src/core/change_detection/change_detection';
import { CompileView } from './compile_view';
import { CompileElement, CompileNode } from './compile_element';
import { templateVisitAll } from '../template_ast';
import { getViewFactoryName, createFlatArray, createDiTokenExpression } from './util';
import { ViewType } from 'angular2/src/core/linker/view_type';
import { ViewEncapsulation } from 'angular2/src/core/metadata/view';
import { CompileIdentifierMetadata } from '../compile_metadata';
const IMPLICIT_TEMPLATE_VAR = '\$implicit';
const CLASS_ATTR = 'class';
const STYLE_ATTR = 'style';
var parentRenderNodeVar = o.variable('parentRenderNode');
var rootSelectorVar = o.variable('rootSelector');
export class ViewCompileDependency {
    constructor(comp, factoryPlaceholder) {
        this.comp = comp;
        this.factoryPlaceholder = factoryPlaceholder;
    }
}
export function buildView(view, template, targetDependencies) {
    var builderVisitor = new ViewBuilderVisitor(view, targetDependencies);
    templateVisitAll(builderVisitor, template, view.declarationElement.isNull() ?
        view.declarationElement :
        view.declarationElement.parent);
    return builderVisitor.nestedViewCount;
}
export function finishView(view, targetStatements) {
    view.afterNodes();
    createViewTopLevelStmts(view, targetStatements);
    view.nodes.forEach((node) => {
        if (node instanceof CompileElement && isPresent(node.embeddedView)) {
            finishView(node.embeddedView, targetStatements);
        }
    });
}
class ViewBuilderVisitor {
    constructor(view, targetDependencies) {
        this.view = view;
        this.targetDependencies = targetDependencies;
        this.nestedViewCount = 0;
    }
    _isRootNode(parent) { return parent.view !== this.view; }
    _addRootNodeAndProject(node, ngContentIndex, parent) {
        var vcAppEl = (node instanceof CompileElement && node.hasViewContainer) ? node.appElement : null;
        if (this._isRootNode(parent)) {
            // store appElement as root node only for ViewContainers
            if (this.view.viewType !== ViewType.COMPONENT) {
                this.view.rootNodesOrAppElements.push(isPresent(vcAppEl) ? vcAppEl : node.renderNode);
            }
        }
        else if (isPresent(parent.component) && isPresent(ngContentIndex)) {
            parent.addContentNode(ngContentIndex, isPresent(vcAppEl) ? vcAppEl : node.renderNode);
        }
    }
    _getParentRenderNode(parent) {
        if (this._isRootNode(parent)) {
            if (this.view.viewType === ViewType.COMPONENT) {
                return parentRenderNodeVar;
            }
            else {
                // root node of an embedded/host view
                return o.NULL_EXPR;
            }
        }
        else {
            return isPresent(parent.component) &&
                parent.component.template.encapsulation !== ViewEncapsulation.Native ?
                o.NULL_EXPR :
                parent.renderNode;
        }
    }
    visitBoundText(ast, parent) {
        return this._visitText(ast, '', ast.ngContentIndex, parent);
    }
    visitText(ast, parent) {
        return this._visitText(ast, ast.value, ast.ngContentIndex, parent);
    }
    _visitText(ast, value, ngContentIndex, parent) {
        var fieldName = `_text_${this.view.nodes.length}`;
        this.view.fields.push(new o.ClassField(fieldName, o.importType(this.view.genConfig.renderTypes.renderText), [o.StmtModifier.Private]));
        var renderNode = o.THIS_EXPR.prop(fieldName);
        var compileNode = new CompileNode(parent, this.view, this.view.nodes.length, renderNode, ast);
        var createRenderNode = o.THIS_EXPR.prop(fieldName)
            .set(ViewProperties.renderer.callMethod('createText', [
            this._getParentRenderNode(parent),
            o.literal(value),
            this.view.createMethod.resetDebugInfoExpr(this.view.nodes.length, ast)
        ]))
            .toStmt();
        this.view.nodes.push(compileNode);
        this.view.createMethod.addStmt(createRenderNode);
        this._addRootNodeAndProject(compileNode, ngContentIndex, parent);
        return renderNode;
    }
    visitNgContent(ast, parent) {
        // the projected nodes originate from a different view, so we don't
        // have debug information for them...
        this.view.createMethod.resetDebugInfo(null, ast);
        var parentRenderNode = this._getParentRenderNode(parent);
        var nodesExpression = ViewProperties.projectableNodes.key(o.literal(ast.index), new o.ArrayType(o.importType(this.view.genConfig.renderTypes.renderNode)));
        if (parentRenderNode !== o.NULL_EXPR) {
            this.view.createMethod.addStmt(ViewProperties.renderer.callMethod('projectNodes', [
                parentRenderNode,
                o.importExpr(Identifiers.flattenNestedViewRenderNodes)
                    .callFn([nodesExpression])
            ])
                .toStmt());
        }
        else if (this._isRootNode(parent)) {
            if (this.view.viewType !== ViewType.COMPONENT) {
                // store root nodes only for embedded/host views
                this.view.rootNodesOrAppElements.push(nodesExpression);
            }
        }
        else {
            if (isPresent(parent.component) && isPresent(ast.ngContentIndex)) {
                parent.addContentNode(ast.ngContentIndex, nodesExpression);
            }
        }
        return null;
    }
    visitElement(ast, parent) {
        var nodeIndex = this.view.nodes.length;
        var createRenderNodeExpr;
        var debugContextExpr = this.view.createMethod.resetDebugInfoExpr(nodeIndex, ast);
        if (nodeIndex === 0 && this.view.viewType === ViewType.HOST) {
            createRenderNodeExpr = o.THIS_EXPR.callMethod('selectOrCreateHostElement', [o.literal(ast.name), rootSelectorVar, debugContextExpr]);
        }
        else {
            createRenderNodeExpr = ViewProperties.renderer.callMethod('createElement', [this._getParentRenderNode(parent), o.literal(ast.name), debugContextExpr]);
        }
        var fieldName = `_el_${nodeIndex}`;
        this.view.fields.push(new o.ClassField(fieldName, o.importType(this.view.genConfig.renderTypes.renderElement), [o.StmtModifier.Private]));
        this.view.createMethod.addStmt(o.THIS_EXPR.prop(fieldName).set(createRenderNodeExpr).toStmt());
        var renderNode = o.THIS_EXPR.prop(fieldName);
        var directives = ast.directives.map(directiveAst => directiveAst.directive);
        var component = directives.find(directive => directive.isComponent);
        var htmlAttrs = _readHtmlAttrs(ast.attrs);
        var attrNameAndValues = _mergeHtmlAndDirectiveAttrs(htmlAttrs, directives);
        for (var i = 0; i < attrNameAndValues.length; i++) {
            var attrName = attrNameAndValues[i][0];
            var attrValue = attrNameAndValues[i][1];
            this.view.createMethod.addStmt(ViewProperties.renderer.callMethod('setElementAttribute', [renderNode, o.literal(attrName), o.literal(attrValue)])
                .toStmt());
        }
        var compileElement = new CompileElement(parent, this.view, nodeIndex, renderNode, ast, component, directives, ast.providers, ast.hasViewContainer, false, ast.references);
        this.view.nodes.push(compileElement);
        var compViewExpr = null;
        if (isPresent(component)) {
            var nestedComponentIdentifier = new CompileIdentifierMetadata({ name: getViewFactoryName(component, 0) });
            this.targetDependencies.push(new ViewCompileDependency(component, nestedComponentIdentifier));
            compViewExpr = o.variable(`compView_${nodeIndex}`);
            compileElement.setComponentView(compViewExpr);
            this.view.createMethod.addStmt(compViewExpr.set(o.importExpr(nestedComponentIdentifier)
                .callFn([
                ViewProperties.viewUtils,
                compileElement.injector,
                compileElement.appElement
            ]))
                .toDeclStmt());
        }
        compileElement.beforeChildren();
        this._addRootNodeAndProject(compileElement, ast.ngContentIndex, parent);
        templateVisitAll(this, ast.children, compileElement);
        compileElement.afterChildren(this.view.nodes.length - nodeIndex - 1);
        if (isPresent(compViewExpr)) {
            var codeGenContentNodes;
            if (this.view.component.type.isHost) {
                codeGenContentNodes = ViewProperties.projectableNodes;
            }
            else {
                codeGenContentNodes = o.literalArr(compileElement.contentNodesByNgContentIndex.map(nodes => createFlatArray(nodes)));
            }
            this.view.createMethod.addStmt(compViewExpr.callMethod('create', [codeGenContentNodes, o.NULL_EXPR]).toStmt());
        }
        return null;
    }
    visitEmbeddedTemplate(ast, parent) {
        var nodeIndex = this.view.nodes.length;
        var fieldName = `_anchor_${nodeIndex}`;
        this.view.fields.push(new o.ClassField(fieldName, o.importType(this.view.genConfig.renderTypes.renderComment), [o.StmtModifier.Private]));
        this.view.createMethod.addStmt(o.THIS_EXPR.prop(fieldName)
            .set(ViewProperties.renderer.callMethod('createTemplateAnchor', [
            this._getParentRenderNode(parent),
            this.view.createMethod.resetDebugInfoExpr(nodeIndex, ast)
        ]))
            .toStmt());
        var renderNode = o.THIS_EXPR.prop(fieldName);
        var templateVariableBindings = ast.variables.map(varAst => [varAst.value.length > 0 ? varAst.value : IMPLICIT_TEMPLATE_VAR, varAst.name]);
        var directives = ast.directives.map(directiveAst => directiveAst.directive);
        var compileElement = new CompileElement(parent, this.view, nodeIndex, renderNode, ast, null, directives, ast.providers, ast.hasViewContainer, true, ast.references);
        this.view.nodes.push(compileElement);
        this.nestedViewCount++;
        var embeddedView = new CompileView(this.view.component, this.view.genConfig, this.view.pipeMetas, o.NULL_EXPR, this.view.viewIndex + this.nestedViewCount, compileElement, templateVariableBindings);
        this.nestedViewCount += buildView(embeddedView, ast.children, this.targetDependencies);
        compileElement.beforeChildren();
        this._addRootNodeAndProject(compileElement, ast.ngContentIndex, parent);
        compileElement.afterChildren(0);
        return null;
    }
    visitAttr(ast, ctx) { return null; }
    visitDirective(ast, ctx) { return null; }
    visitEvent(ast, eventTargetAndNames) {
        return null;
    }
    visitReference(ast, ctx) { return null; }
    visitVariable(ast, ctx) { return null; }
    visitDirectiveProperty(ast, context) { return null; }
    visitElementProperty(ast, context) { return null; }
}
function _mergeHtmlAndDirectiveAttrs(declaredHtmlAttrs, directives) {
    var result = {};
    StringMapWrapper.forEach(declaredHtmlAttrs, (value, key) => { result[key] = value; });
    directives.forEach(directiveMeta => {
        StringMapWrapper.forEach(directiveMeta.hostAttributes, (value, name) => {
            var prevValue = result[name];
            result[name] = isPresent(prevValue) ? mergeAttributeValue(name, prevValue, value) : value;
        });
    });
    return mapToKeyValueArray(result);
}
function _readHtmlAttrs(attrs) {
    var htmlAttrs = {};
    attrs.forEach((ast) => { htmlAttrs[ast.name] = ast.value; });
    return htmlAttrs;
}
function mergeAttributeValue(attrName, attrValue1, attrValue2) {
    if (attrName == CLASS_ATTR || attrName == STYLE_ATTR) {
        return `${attrValue1} ${attrValue2}`;
    }
    else {
        return attrValue2;
    }
}
function mapToKeyValueArray(data) {
    var entryArray = [];
    StringMapWrapper.forEach(data, (value, name) => { entryArray.push([name, value]); });
    // We need to sort to get a defined output order
    // for tests and for caching generated artifacts...
    ListWrapper.sort(entryArray, (entry1, entry2) => StringWrapper.compare(entry1[0], entry2[0]));
    var keyValueArray = [];
    entryArray.forEach((entry) => { keyValueArray.push([entry[0], entry[1]]); });
    return keyValueArray;
}
function createViewTopLevelStmts(view, targetStatements) {
    var nodeDebugInfosVar = o.NULL_EXPR;
    if (view.genConfig.genDebugInfo) {
        nodeDebugInfosVar = o.variable(`nodeDebugInfos_${view.component.type.name}${view.viewIndex}`);
        targetStatements.push(nodeDebugInfosVar
            .set(o.literalArr(view.nodes.map(createStaticNodeDebugInfo), new o.ArrayType(new o.ExternalType(Identifiers.StaticNodeDebugInfo), [o.TypeModifier.Const])))
            .toDeclStmt(null, [o.StmtModifier.Final]));
    }
    var renderCompTypeVar = o.variable(`renderType_${view.component.type.name}`);
    if (view.viewIndex === 0) {
        targetStatements.push(renderCompTypeVar.set(o.NULL_EXPR)
            .toDeclStmt(o.importType(Identifiers.RenderComponentType)));
    }
    var viewClass = createViewClass(view, renderCompTypeVar, nodeDebugInfosVar);
    targetStatements.push(viewClass);
    targetStatements.push(createViewFactory(view, viewClass, renderCompTypeVar));
}
function createStaticNodeDebugInfo(node) {
    var compileElement = node instanceof CompileElement ? node : null;
    var providerTokens = [];
    var componentToken = o.NULL_EXPR;
    var varTokenEntries = [];
    if (isPresent(compileElement)) {
        providerTokens = compileElement.getProviderTokens();
        if (isPresent(compileElement.component)) {
            componentToken = createDiTokenExpression(identifierToken(compileElement.component.type));
        }
        StringMapWrapper.forEach(compileElement.referenceTokens, (token, varName) => {
            varTokenEntries.push([varName, isPresent(token) ? createDiTokenExpression(token) : o.NULL_EXPR]);
        });
    }
    return o.importExpr(Identifiers.StaticNodeDebugInfo)
        .instantiate([
        o.literalArr(providerTokens, new o.ArrayType(o.DYNAMIC_TYPE, [o.TypeModifier.Const])),
        componentToken,
        o.literalMap(varTokenEntries, new o.MapType(o.DYNAMIC_TYPE, [o.TypeModifier.Const]))
    ], o.importType(Identifiers.StaticNodeDebugInfo, null, [o.TypeModifier.Const]));
}
function createViewClass(view, renderCompTypeVar, nodeDebugInfosVar) {
    var emptyTemplateVariableBindings = view.templateVariableBindings.map((entry) => [entry[0], o.NULL_EXPR]);
    var viewConstructorArgs = [
        new o.FnParam(ViewConstructorVars.viewUtils.name, o.importType(Identifiers.ViewUtils)),
        new o.FnParam(ViewConstructorVars.parentInjector.name, o.importType(Identifiers.Injector)),
        new o.FnParam(ViewConstructorVars.declarationEl.name, o.importType(Identifiers.AppElement))
    ];
    var superConstructorArgs = [
        o.variable(view.className),
        renderCompTypeVar,
        ViewTypeEnum.fromValue(view.viewType),
        o.literalMap(emptyTemplateVariableBindings),
        ViewConstructorVars.viewUtils,
        ViewConstructorVars.parentInjector,
        ViewConstructorVars.declarationEl,
        ChangeDetectionStrategyEnum.fromValue(getChangeDetectionMode(view)),
    ];
    if (view.genConfig.genDebugInfo) {
        superConstructorArgs.push(nodeDebugInfosVar);
    }
    var viewConstructor = new o.ClassMethod(null, viewConstructorArgs, [o.SUPER_EXPR.callFn(superConstructorArgs).toStmt()]);
    var viewMethods = [
        new o.ClassMethod('createInternal', [new o.FnParam(rootSelectorVar.name, o.DYNAMIC_TYPE)], generateCreateMethod(view), o.importType(Identifiers.AppElement)),
        new o.ClassMethod('injectorGetInternal', [
            new o.FnParam(InjectMethodVars.token.name, o.DYNAMIC_TYPE),
            // Note: Can't use o.INT_TYPE here as the method in AppView uses number
            new o.FnParam(InjectMethodVars.requestNodeIndex.name, o.NUMBER_TYPE),
            new o.FnParam(InjectMethodVars.notFoundResult.name, o.DYNAMIC_TYPE)
        ], addReturnValuefNotEmpty(view.injectorGetMethod.finish(), InjectMethodVars.notFoundResult), o.DYNAMIC_TYPE),
        new o.ClassMethod('detectChangesInternal', [new o.FnParam(DetectChangesVars.throwOnChange.name, o.BOOL_TYPE)], generateDetectChangesMethod(view)),
        new o.ClassMethod('dirtyParentQueriesInternal', [], view.dirtyParentQueriesMethod.finish()),
        new o.ClassMethod('destroyInternal', [], view.destroyMethod.finish())
    ].concat(view.eventHandlerMethods);
    var superClass = view.genConfig.genDebugInfo ? Identifiers.DebugAppView : Identifiers.AppView;
    var viewClass = new o.ClassStmt(view.className, o.importExpr(superClass, [getContextType(view)]), view.fields, view.getters, viewConstructor, viewMethods.filter((method) => method.body.length > 0));
    return viewClass;
}
function createViewFactory(view, viewClass, renderCompTypeVar) {
    var viewFactoryArgs = [
        new o.FnParam(ViewConstructorVars.viewUtils.name, o.importType(Identifiers.ViewUtils)),
        new o.FnParam(ViewConstructorVars.parentInjector.name, o.importType(Identifiers.Injector)),
        new o.FnParam(ViewConstructorVars.declarationEl.name, o.importType(Identifiers.AppElement))
    ];
    var initRenderCompTypeStmts = [];
    var templateUrlInfo;
    if (view.component.template.templateUrl == view.component.type.moduleUrl) {
        templateUrlInfo =
            `${view.component.type.moduleUrl} class ${view.component.type.name} - inline template`;
    }
    else {
        templateUrlInfo = view.component.template.templateUrl;
    }
    if (view.viewIndex === 0) {
        initRenderCompTypeStmts = [
            new o.IfStmt(renderCompTypeVar.identical(o.NULL_EXPR), [
                renderCompTypeVar.set(ViewConstructorVars
                    .viewUtils.callMethod('createRenderComponentType', [
                    o.literal(templateUrlInfo),
                    o.literal(view.component
                        .template.ngContentSelectors.length),
                    ViewEncapsulationEnum
                        .fromValue(view.component.template.encapsulation),
                    view.styles
                ]))
                    .toStmt()
            ])
        ];
    }
    return o.fn(viewFactoryArgs, initRenderCompTypeStmts.concat([
        new o.ReturnStatement(o.variable(viewClass.name)
            .instantiate(viewClass.constructorMethod.params.map((param) => o.variable(param.name))))
    ]), o.importType(Identifiers.AppView, [getContextType(view)]))
        .toDeclStmt(view.viewFactory.name, [o.StmtModifier.Final]);
}
function generateCreateMethod(view) {
    var parentRenderNodeExpr = o.NULL_EXPR;
    var parentRenderNodeStmts = [];
    if (view.viewType === ViewType.COMPONENT) {
        parentRenderNodeExpr = ViewProperties.renderer.callMethod('createViewRoot', [o.THIS_EXPR.prop('declarationAppElement').prop('nativeElement')]);
        parentRenderNodeStmts = [
            parentRenderNodeVar.set(parentRenderNodeExpr)
                .toDeclStmt(o.importType(view.genConfig.renderTypes.renderNode), [o.StmtModifier.Final])
        ];
    }
    var resultExpr;
    if (view.viewType === ViewType.HOST) {
        resultExpr = view.nodes[0].appElement;
    }
    else {
        resultExpr = o.NULL_EXPR;
    }
    return parentRenderNodeStmts.concat(view.createMethod.finish())
        .concat([
        o.THIS_EXPR.callMethod('init', [
            createFlatArray(view.rootNodesOrAppElements),
            o.literalArr(view.nodes.map(node => node.renderNode)),
            o.literalArr(view.disposables),
            o.literalArr(view.subscriptions)
        ])
            .toStmt(),
        new o.ReturnStatement(resultExpr)
    ]);
}
function generateDetectChangesMethod(view) {
    var stmts = [];
    if (view.detectChangesInInputsMethod.isEmpty() && view.updateContentQueriesMethod.isEmpty() &&
        view.afterContentLifecycleCallbacksMethod.isEmpty() &&
        view.detectChangesRenderPropertiesMethod.isEmpty() &&
        view.updateViewQueriesMethod.isEmpty() && view.afterViewLifecycleCallbacksMethod.isEmpty()) {
        return stmts;
    }
    ListWrapper.addAll(stmts, view.detectChangesInInputsMethod.finish());
    stmts.push(o.THIS_EXPR.callMethod('detectContentChildrenChanges', [DetectChangesVars.throwOnChange])
        .toStmt());
    var afterContentStmts = view.updateContentQueriesMethod.finish().concat(view.afterContentLifecycleCallbacksMethod.finish());
    if (afterContentStmts.length > 0) {
        stmts.push(new o.IfStmt(o.not(DetectChangesVars.throwOnChange), afterContentStmts));
    }
    ListWrapper.addAll(stmts, view.detectChangesRenderPropertiesMethod.finish());
    stmts.push(o.THIS_EXPR.callMethod('detectViewChildrenChanges', [DetectChangesVars.throwOnChange])
        .toStmt());
    var afterViewStmts = view.updateViewQueriesMethod.finish().concat(view.afterViewLifecycleCallbacksMethod.finish());
    if (afterViewStmts.length > 0) {
        stmts.push(new o.IfStmt(o.not(DetectChangesVars.throwOnChange), afterViewStmts));
    }
    var varStmts = [];
    var readVars = o.findReadVarNames(stmts);
    if (SetWrapper.has(readVars, DetectChangesVars.changed.name)) {
        varStmts.push(DetectChangesVars.changed.set(o.literal(true)).toDeclStmt(o.BOOL_TYPE));
    }
    if (SetWrapper.has(readVars, DetectChangesVars.changes.name)) {
        varStmts.push(DetectChangesVars.changes.set(o.NULL_EXPR)
            .toDeclStmt(new o.MapType(o.importType(Identifiers.SimpleChange))));
    }
    if (SetWrapper.has(readVars, DetectChangesVars.valUnwrapper.name)) {
        varStmts.push(DetectChangesVars.valUnwrapper.set(o.importExpr(Identifiers.ValueUnwrapper).instantiate([]))
            .toDeclStmt(null, [o.StmtModifier.Final]));
    }
    return varStmts.concat(stmts);
}
function addReturnValuefNotEmpty(statements, value) {
    if (statements.length > 0) {
        return statements.concat([new o.ReturnStatement(value)]);
    }
    else {
        return statements;
    }
}
function getContextType(view) {
    var typeMeta = view.component.type;
    return typeMeta.isHost ? o.DYNAMIC_TYPE : o.importType(typeMeta);
}
function getChangeDetectionMode(view) {
    var mode;
    if (view.viewType === ViewType.COMPONENT) {
        mode = isDefaultChangeDetectionStrategy(view.component.changeDetection) ?
            ChangeDetectionStrategy.CheckAlways :
            ChangeDetectionStrategy.CheckOnce;
    }
    else {
        mode = ChangeDetectionStrategy.CheckAlways;
    }
    return mode;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld19idWlsZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZGlmZmluZ19wbHVnaW5fd3JhcHBlci1vdXRwdXRfcGF0aC14UkVySXpuRS50bXAvYW5ndWxhcjIvc3JjL2NvbXBpbGVyL3ZpZXdfY29tcGlsZXIvdmlld19idWlsZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJPQUFPLEVBQUMsU0FBUyxFQUFXLGFBQWEsRUFBQyxNQUFNLDBCQUEwQjtPQUNuRSxFQUFDLFdBQVcsRUFBRSxnQkFBZ0IsRUFBRSxVQUFVLEVBQUMsTUFBTSxnQ0FBZ0M7T0FFakYsS0FBSyxDQUFDLE1BQU0sc0JBQXNCO09BQ2xDLEVBQUMsV0FBVyxFQUFFLGVBQWUsRUFBQyxNQUFNLGdCQUFnQjtPQUNwRCxFQUNMLG1CQUFtQixFQUNuQixnQkFBZ0IsRUFDaEIsaUJBQWlCLEVBQ2pCLFlBQVksRUFDWixxQkFBcUIsRUFDckIsMkJBQTJCLEVBQzNCLGNBQWMsRUFDZixNQUFNLGFBQWE7T0FDYixFQUNMLHVCQUF1QixFQUN2QixnQ0FBZ0MsRUFDakMsTUFBTSxxREFBcUQ7T0FFckQsRUFBQyxXQUFXLEVBQUMsTUFBTSxnQkFBZ0I7T0FDbkMsRUFBQyxjQUFjLEVBQUUsV0FBVyxFQUFDLE1BQU0sbUJBQW1CO09BRXRELEVBZUwsZ0JBQWdCLEVBR2pCLE1BQU0saUJBQWlCO09BRWpCLEVBQUMsa0JBQWtCLEVBQUUsZUFBZSxFQUFFLHVCQUF1QixFQUFDLE1BQU0sUUFBUTtPQUU1RSxFQUFDLFFBQVEsRUFBQyxNQUFNLG9DQUFvQztPQUNwRCxFQUFDLGlCQUFpQixFQUFDLE1BQU0saUNBQWlDO09BRTFELEVBQ0wseUJBQXlCLEVBRzFCLE1BQU0scUJBQXFCO0FBRTVCLE1BQU0scUJBQXFCLEdBQUcsWUFBWSxDQUFDO0FBQzNDLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQztBQUMzQixNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUM7QUFFM0IsSUFBSSxtQkFBbUIsR0FBRyxDQUFDLENBQUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLENBQUM7QUFDekQsSUFBSSxlQUFlLEdBQUcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsQ0FBQztBQUVqRDtJQUNFLFlBQW1CLElBQThCLEVBQzlCLGtCQUE2QztRQUQ3QyxTQUFJLEdBQUosSUFBSSxDQUEwQjtRQUM5Qix1QkFBa0IsR0FBbEIsa0JBQWtCLENBQTJCO0lBQUcsQ0FBQztBQUN0RSxDQUFDO0FBRUQsMEJBQTBCLElBQWlCLEVBQUUsUUFBdUIsRUFDMUMsa0JBQTJDO0lBQ25FLElBQUksY0FBYyxHQUFHLElBQUksa0JBQWtCLENBQUMsSUFBSSxFQUFFLGtCQUFrQixDQUFDLENBQUM7SUFDdEUsZ0JBQWdCLENBQUMsY0FBYyxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxFQUFFO1FBQzVCLElBQUksQ0FBQyxrQkFBa0I7UUFDdkIsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQy9FLE1BQU0sQ0FBQyxjQUFjLENBQUMsZUFBZSxDQUFDO0FBQ3hDLENBQUM7QUFFRCwyQkFBMkIsSUFBaUIsRUFBRSxnQkFBK0I7SUFDM0UsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO0lBQ2xCLHVCQUF1QixDQUFDLElBQUksRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO0lBQ2hELElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSTtRQUN0QixFQUFFLENBQUMsQ0FBQyxJQUFJLFlBQVksY0FBYyxJQUFJLFNBQVMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ25FLFVBQVUsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFDbEQsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQztBQUVEO0lBR0UsWUFBbUIsSUFBaUIsRUFBUyxrQkFBMkM7UUFBckUsU0FBSSxHQUFKLElBQUksQ0FBYTtRQUFTLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBeUI7UUFGeEYsb0JBQWUsR0FBVyxDQUFDLENBQUM7SUFFK0QsQ0FBQztJQUVwRixXQUFXLENBQUMsTUFBc0IsSUFBYSxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUVsRixzQkFBc0IsQ0FBQyxJQUFpQixFQUFFLGNBQXNCLEVBQ3pDLE1BQXNCO1FBQ25ELElBQUksT0FBTyxHQUNQLENBQUMsSUFBSSxZQUFZLGNBQWMsSUFBSSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQztRQUN2RixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM3Qix3REFBd0Q7WUFDeEQsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEtBQUssUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7Z0JBQzlDLElBQUksQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsR0FBRyxPQUFPLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ3hGLENBQUM7UUFDSCxDQUFDO1FBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLElBQUksU0FBUyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwRSxNQUFNLENBQUMsY0FBYyxDQUFDLGNBQWMsRUFBRSxTQUFTLENBQUMsT0FBTyxDQUFDLEdBQUcsT0FBTyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUN4RixDQUFDO0lBQ0gsQ0FBQztJQUVPLG9CQUFvQixDQUFDLE1BQXNCO1FBQ2pELEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzdCLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxLQUFLLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO2dCQUM5QyxNQUFNLENBQUMsbUJBQW1CLENBQUM7WUFDN0IsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNOLHFDQUFxQztnQkFDckMsTUFBTSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7WUFDckIsQ0FBQztRQUNILENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNOLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsTUFBTSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsYUFBYSxLQUFLLGlCQUFpQixDQUFDLE1BQU07Z0JBQ3hFLENBQUMsQ0FBQyxTQUFTO2dCQUNYLE1BQU0sQ0FBQyxVQUFVLENBQUM7UUFDL0IsQ0FBQztJQUNILENBQUM7SUFFRCxjQUFjLENBQUMsR0FBaUIsRUFBRSxNQUFzQjtRQUN0RCxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsRUFBRSxFQUFFLEdBQUcsQ0FBQyxjQUFjLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDOUQsQ0FBQztJQUNELFNBQVMsQ0FBQyxHQUFZLEVBQUUsTUFBc0I7UUFDNUMsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLGNBQWMsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUNyRSxDQUFDO0lBQ08sVUFBVSxDQUFDLEdBQWdCLEVBQUUsS0FBYSxFQUFFLGNBQXNCLEVBQ3ZELE1BQXNCO1FBQ3ZDLElBQUksU0FBUyxHQUFHLFNBQVMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDbEQsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLFVBQVUsQ0FBQyxTQUFTLEVBQ1QsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLEVBQ3hELENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbEUsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDN0MsSUFBSSxXQUFXLEdBQUcsSUFBSSxXQUFXLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLFVBQVUsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUM5RixJQUFJLGdCQUFnQixHQUNoQixDQUFDLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUM7YUFDdEIsR0FBRyxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUNuQyxZQUFZLEVBQ1o7WUFDRSxJQUFJLENBQUMsb0JBQW9CLENBQUMsTUFBTSxDQUFDO1lBQ2pDLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDO1lBQ2hCLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUM7U0FDdkUsQ0FBQyxDQUFDO2FBQ04sTUFBTSxFQUFFLENBQUM7UUFDbEIsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ2xDLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ2pELElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxXQUFXLEVBQUUsY0FBYyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxVQUFVLENBQUM7SUFDcEIsQ0FBQztJQUVELGNBQWMsQ0FBQyxHQUFpQixFQUFFLE1BQXNCO1FBQ3RELG1FQUFtRTtRQUNuRSxxQ0FBcUM7UUFDckMsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNqRCxJQUFJLGdCQUFnQixHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN6RCxJQUFJLGVBQWUsR0FBRyxjQUFjLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUNyRCxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFDcEIsSUFBSSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMvRSxFQUFFLENBQUMsQ0FBQyxnQkFBZ0IsS0FBSyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUNyQyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQzFCLGNBQWMsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUNQLGNBQWMsRUFDZDtnQkFDRSxnQkFBZ0I7Z0JBQ2hCLENBQUMsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLDRCQUE0QixDQUFDO3FCQUNqRCxNQUFNLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQzthQUMvQixDQUFDO2lCQUN4QixNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQ3JCLENBQUM7UUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEtBQUssUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7Z0JBQzlDLGdEQUFnRDtnQkFDaEQsSUFBSSxDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDekQsQ0FBQztRQUNILENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNOLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLElBQUksU0FBUyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2pFLE1BQU0sQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxlQUFlLENBQUMsQ0FBQztZQUM3RCxDQUFDO1FBQ0gsQ0FBQztRQUNELE1BQU0sQ0FBQyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBRUQsWUFBWSxDQUFDLEdBQWUsRUFBRSxNQUFzQjtRQUNsRCxJQUFJLFNBQVMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUM7UUFDdkMsSUFBSSxvQkFBb0IsQ0FBQztRQUN6QixJQUFJLGdCQUFnQixHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNqRixFQUFFLENBQUMsQ0FBQyxTQUFTLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxLQUFLLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQzVELG9CQUFvQixHQUFHLENBQUMsQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUN6QywyQkFBMkIsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLGVBQWUsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7UUFDN0YsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ04sb0JBQW9CLEdBQUcsY0FBYyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQ3JELGVBQWUsRUFDZixDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7UUFDbEYsQ0FBQztRQUNELElBQUksU0FBUyxHQUFHLE9BQU8sU0FBUyxFQUFFLENBQUM7UUFDbkMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUNqQixJQUFJLENBQUMsQ0FBQyxVQUFVLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxFQUN0RSxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2hELElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBRS9GLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRTdDLElBQUksVUFBVSxHQUFHLEdBQUcsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLFlBQVksSUFBSSxZQUFZLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDNUUsSUFBSSxTQUFTLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLElBQUksU0FBUyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ3BFLElBQUksU0FBUyxHQUFHLGNBQWMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDMUMsSUFBSSxpQkFBaUIsR0FBRywyQkFBMkIsQ0FBQyxTQUFTLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDM0UsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxpQkFBaUIsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNsRCxJQUFJLFFBQVEsR0FBRyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN2QyxJQUFJLFNBQVMsR0FBRyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN4QyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQzFCLGNBQWMsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUNQLHFCQUFxQixFQUNyQixDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztpQkFDOUUsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUNyQixDQUFDO1FBQ0QsSUFBSSxjQUFjLEdBQ2QsSUFBSSxjQUFjLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFBRSxHQUFHLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFDcEUsR0FBRyxDQUFDLFNBQVMsRUFBRSxHQUFHLENBQUMsZ0JBQWdCLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUNuRixJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDckMsSUFBSSxZQUFZLEdBQWtCLElBQUksQ0FBQztRQUN2QyxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3pCLElBQUkseUJBQXlCLEdBQ3pCLElBQUkseUJBQXlCLENBQUMsRUFBQyxJQUFJLEVBQUUsa0JBQWtCLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQztZQUM1RSxJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLElBQUkscUJBQXFCLENBQUMsU0FBUyxFQUFFLHlCQUF5QixDQUFDLENBQUMsQ0FBQztZQUM5RixZQUFZLEdBQUcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxZQUFZLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFDbkQsY0FBYyxDQUFDLGdCQUFnQixDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQzlDLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMseUJBQXlCLENBQUM7aUJBQ2xDLE1BQU0sQ0FBQztnQkFDTixjQUFjLENBQUMsU0FBUztnQkFDeEIsY0FBYyxDQUFDLFFBQVE7Z0JBQ3ZCLGNBQWMsQ0FBQyxVQUFVO2FBQzFCLENBQUMsQ0FBQztpQkFDbkIsVUFBVSxFQUFFLENBQUMsQ0FBQztRQUNwRCxDQUFDO1FBQ0QsY0FBYyxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ2hDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxjQUFjLEVBQUUsR0FBRyxDQUFDLGNBQWMsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUN4RSxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLFFBQVEsRUFBRSxjQUFjLENBQUMsQ0FBQztRQUNyRCxjQUFjLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFFckUsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM1QixJQUFJLG1CQUFtQixDQUFDO1lBQ3hCLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUNwQyxtQkFBbUIsR0FBRyxjQUFjLENBQUMsZ0JBQWdCLENBQUM7WUFDeEQsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNOLG1CQUFtQixHQUFHLENBQUMsQ0FBQyxVQUFVLENBQzlCLGNBQWMsQ0FBQyw0QkFBNEIsQ0FBQyxHQUFHLENBQUMsS0FBSyxJQUFJLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDeEYsQ0FBQztZQUNELElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FDMUIsWUFBWSxDQUFDLFVBQVUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQ3RGLENBQUM7UUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDO0lBQ2QsQ0FBQztJQUVELHFCQUFxQixDQUFDLEdBQXdCLEVBQUUsTUFBc0I7UUFDcEUsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDO1FBQ3ZDLElBQUksU0FBUyxHQUFHLFdBQVcsU0FBUyxFQUFFLENBQUM7UUFDdkMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUNqQixJQUFJLENBQUMsQ0FBQyxVQUFVLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxFQUN0RSxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2hELElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FDMUIsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDO2FBQ3RCLEdBQUcsQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FDbkMsc0JBQXNCLEVBQ3RCO1lBQ0UsSUFBSSxDQUFDLG9CQUFvQixDQUFDLE1BQU0sQ0FBQztZQUNqQyxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDO1NBQzFELENBQUMsQ0FBQzthQUNOLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDbkIsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFN0MsSUFBSSx3QkFBd0IsR0FBRyxHQUFHLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FDNUMsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxLQUFLLEdBQUcscUJBQXFCLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFFN0YsSUFBSSxVQUFVLEdBQUcsR0FBRyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsWUFBWSxJQUFJLFlBQVksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUM1RSxJQUFJLGNBQWMsR0FDZCxJQUFJLGNBQWMsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUUsVUFBVSxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUMvRCxHQUFHLENBQUMsU0FBUyxFQUFFLEdBQUcsQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ2xGLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUVyQyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDdkIsSUFBSSxZQUFZLEdBQUcsSUFBSSxXQUFXLENBQzlCLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxTQUFTLEVBQzFFLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxlQUFlLEVBQUUsY0FBYyxFQUFFLHdCQUF3QixDQUFDLENBQUM7UUFDMUYsSUFBSSxDQUFDLGVBQWUsSUFBSSxTQUFTLENBQUMsWUFBWSxFQUFFLEdBQUcsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFFdkYsY0FBYyxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ2hDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxjQUFjLEVBQUUsR0FBRyxDQUFDLGNBQWMsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUN4RSxjQUFjLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRWhDLE1BQU0sQ0FBQyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBRUQsU0FBUyxDQUFDLEdBQVksRUFBRSxHQUFRLElBQVMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDdkQsY0FBYyxDQUFDLEdBQWlCLEVBQUUsR0FBUSxJQUFTLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ2pFLFVBQVUsQ0FBQyxHQUFrQixFQUFFLG1CQUErQztRQUM1RSxNQUFNLENBQUMsSUFBSSxDQUFDO0lBQ2QsQ0FBQztJQUVELGNBQWMsQ0FBQyxHQUFpQixFQUFFLEdBQVEsSUFBUyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUNqRSxhQUFhLENBQUMsR0FBZ0IsRUFBRSxHQUFRLElBQVMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDL0Qsc0JBQXNCLENBQUMsR0FBOEIsRUFBRSxPQUFZLElBQVMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDMUYsb0JBQW9CLENBQUMsR0FBNEIsRUFBRSxPQUFZLElBQVMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDeEYsQ0FBQztBQUVELHFDQUFxQyxpQkFBMEMsRUFDMUMsVUFBc0M7SUFDekUsSUFBSSxNQUFNLEdBQTRCLEVBQUUsQ0FBQztJQUN6QyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxLQUFLLEVBQUUsR0FBRyxPQUFPLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN0RixVQUFVLENBQUMsT0FBTyxDQUFDLGFBQWE7UUFDOUIsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxLQUFLLEVBQUUsSUFBSTtZQUNqRSxJQUFJLFNBQVMsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDN0IsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUMsR0FBRyxtQkFBbUIsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLEtBQUssQ0FBQyxHQUFHLEtBQUssQ0FBQztRQUM1RixDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0gsTUFBTSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ3BDLENBQUM7QUFFRCx3QkFBd0IsS0FBZ0I7SUFDdEMsSUFBSSxTQUFTLEdBQTRCLEVBQUUsQ0FBQztJQUM1QyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxPQUFPLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzdELE1BQU0sQ0FBQyxTQUFTLENBQUM7QUFDbkIsQ0FBQztBQUVELDZCQUE2QixRQUFnQixFQUFFLFVBQWtCLEVBQUUsVUFBa0I7SUFDbkYsRUFBRSxDQUFDLENBQUMsUUFBUSxJQUFJLFVBQVUsSUFBSSxRQUFRLElBQUksVUFBVSxDQUFDLENBQUMsQ0FBQztRQUNyRCxNQUFNLENBQUMsR0FBRyxVQUFVLElBQUksVUFBVSxFQUFFLENBQUM7SUFDdkMsQ0FBQztJQUFDLElBQUksQ0FBQyxDQUFDO1FBQ04sTUFBTSxDQUFDLFVBQVUsQ0FBQztJQUNwQixDQUFDO0FBQ0gsQ0FBQztBQUVELDRCQUE0QixJQUE2QjtJQUN2RCxJQUFJLFVBQVUsR0FBRyxFQUFFLENBQUM7SUFDcEIsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDLEtBQUssRUFBRSxJQUFJLE9BQU8sVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDckYsZ0RBQWdEO0lBQ2hELG1EQUFtRDtJQUNuRCxXQUFXLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEtBQUssYUFBYSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM5RixJQUFJLGFBQWEsR0FBRyxFQUFFLENBQUM7SUFDdkIsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEtBQUssT0FBTyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM3RSxNQUFNLENBQUMsYUFBYSxDQUFDO0FBQ3ZCLENBQUM7QUFFRCxpQ0FBaUMsSUFBaUIsRUFBRSxnQkFBK0I7SUFDakYsSUFBSSxpQkFBaUIsR0FBaUIsQ0FBQyxDQUFDLFNBQVMsQ0FBQztJQUNsRCxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7UUFDaEMsaUJBQWlCLEdBQUcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBQzlGLGdCQUFnQixDQUFDLElBQUksQ0FDRCxpQkFBa0I7YUFDN0IsR0FBRyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMseUJBQXlCLENBQUMsRUFDekMsSUFBSSxDQUFDLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsbUJBQW1CLENBQUMsRUFDbkQsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUMxRCxVQUFVLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDckQsQ0FBQztJQUdELElBQUksaUJBQWlCLEdBQWtCLENBQUMsQ0FBQyxRQUFRLENBQUMsY0FBYyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQzVGLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN6QixnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7YUFDN0IsVUFBVSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3hGLENBQUM7SUFFRCxJQUFJLFNBQVMsR0FBRyxlQUFlLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFLGlCQUFpQixDQUFDLENBQUM7SUFDNUUsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ2pDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLGlCQUFpQixDQUFDLENBQUMsQ0FBQztBQUMvRSxDQUFDO0FBRUQsbUNBQW1DLElBQWlCO0lBQ2xELElBQUksY0FBYyxHQUFHLElBQUksWUFBWSxjQUFjLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztJQUNsRSxJQUFJLGNBQWMsR0FBbUIsRUFBRSxDQUFDO0lBQ3hDLElBQUksY0FBYyxHQUFpQixDQUFDLENBQUMsU0FBUyxDQUFDO0lBQy9DLElBQUksZUFBZSxHQUFHLEVBQUUsQ0FBQztJQUN6QixFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlCLGNBQWMsR0FBRyxjQUFjLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztRQUNwRCxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN4QyxjQUFjLEdBQUcsdUJBQXVCLENBQUMsZUFBZSxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUMzRixDQUFDO1FBQ0QsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxlQUFlLEVBQUUsQ0FBQyxLQUFLLEVBQUUsT0FBTztZQUN0RSxlQUFlLENBQUMsSUFBSSxDQUNoQixDQUFDLE9BQU8sRUFBRSxTQUFTLENBQUMsS0FBSyxDQUFDLEdBQUcsdUJBQXVCLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDbEYsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBQ0QsTUFBTSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLG1CQUFtQixDQUFDO1NBQy9DLFdBQVcsQ0FDUjtRQUNFLENBQUMsQ0FBQyxVQUFVLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ3JGLGNBQWM7UUFDZCxDQUFDLENBQUMsVUFBVSxDQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztLQUNyRixFQUNELENBQUMsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLG1CQUFtQixFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3ZGLENBQUM7QUFFRCx5QkFBeUIsSUFBaUIsRUFBRSxpQkFBZ0MsRUFDbkQsaUJBQStCO0lBQ3RELElBQUksNkJBQTZCLEdBQzdCLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDMUUsSUFBSSxtQkFBbUIsR0FBRztRQUN4QixJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsbUJBQW1CLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN0RixJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsbUJBQW1CLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMxRixJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsbUJBQW1CLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQztLQUM1RixDQUFDO0lBQ0YsSUFBSSxvQkFBb0IsR0FBRztRQUN6QixDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUM7UUFDMUIsaUJBQWlCO1FBQ2pCLFlBQVksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQztRQUNyQyxDQUFDLENBQUMsVUFBVSxDQUFDLDZCQUE2QixDQUFDO1FBQzNDLG1CQUFtQixDQUFDLFNBQVM7UUFDN0IsbUJBQW1CLENBQUMsY0FBYztRQUNsQyxtQkFBbUIsQ0FBQyxhQUFhO1FBQ2pDLDJCQUEyQixDQUFDLFNBQVMsQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUNwRSxDQUFDO0lBQ0YsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO1FBQ2hDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0lBQy9DLENBQUM7SUFDRCxJQUFJLGVBQWUsR0FBRyxJQUFJLENBQUMsQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUN6QixDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLG9CQUFvQixDQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBRTlGLElBQUksV0FBVyxHQUFHO1FBQ2hCLElBQUksQ0FBQyxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxFQUN2RSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUNuRixJQUFJLENBQUMsQ0FBQyxXQUFXLENBQ2IscUJBQXFCLEVBQ3JCO1lBQ0UsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLFlBQVksQ0FBQztZQUMxRCx1RUFBdUU7WUFDdkUsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDLGdCQUFnQixDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDO1lBQ3BFLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUM7U0FDcEUsRUFDRCx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsTUFBTSxFQUFFLEVBQUUsZ0JBQWdCLENBQUMsY0FBYyxDQUFDLEVBQ3pGLENBQUMsQ0FBQyxZQUFZLENBQUM7UUFDbkIsSUFBSSxDQUFDLENBQUMsV0FBVyxDQUFDLHVCQUF1QixFQUN2QixDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUNsRSwyQkFBMkIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNwRCxJQUFJLENBQUMsQ0FBQyxXQUFXLENBQUMsNEJBQTRCLEVBQUUsRUFBRSxFQUFFLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUMzRixJQUFJLENBQUMsQ0FBQyxXQUFXLENBQUMsaUJBQWlCLEVBQUUsRUFBRSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLENBQUM7S0FDdEUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUM7SUFDbkMsSUFBSSxVQUFVLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxZQUFZLEdBQUcsV0FBVyxDQUFDLFlBQVksR0FBRyxXQUFXLENBQUMsT0FBTyxDQUFDO0lBQzlGLElBQUksU0FBUyxHQUFHLElBQUksQ0FBQyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsVUFBVSxFQUFFLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFDaEUsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLGVBQWUsRUFDMUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sS0FBSyxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3hGLE1BQU0sQ0FBQyxTQUFTLENBQUM7QUFDbkIsQ0FBQztBQUVELDJCQUEyQixJQUFpQixFQUFFLFNBQXNCLEVBQ3pDLGlCQUFnQztJQUN6RCxJQUFJLGVBQWUsR0FBRztRQUNwQixJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsbUJBQW1CLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN0RixJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsbUJBQW1CLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMxRixJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsbUJBQW1CLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQztLQUM1RixDQUFDO0lBQ0YsSUFBSSx1QkFBdUIsR0FBRyxFQUFFLENBQUM7SUFDakMsSUFBSSxlQUFlLENBQUM7SUFDcEIsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsV0FBVyxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDekUsZUFBZTtZQUNYLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsU0FBUyxVQUFVLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksb0JBQW9CLENBQUM7SUFDN0YsQ0FBQztJQUFDLElBQUksQ0FBQyxDQUFDO1FBQ04sZUFBZSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQztJQUN4RCxDQUFDO0lBQ0QsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pCLHVCQUF1QixHQUFHO1lBQ3hCLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxFQUN4QztnQkFDRSxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsbUJBQW1CO3FCQUNkLFNBQVMsQ0FBQyxVQUFVLENBQUMsMkJBQTJCLEVBQzNCO29CQUNFLENBQUMsQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDO29CQUMxQixDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxTQUFTO3lCQUNULFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUM7b0JBQ2xELHFCQUFxQjt5QkFDaEIsU0FBUyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQztvQkFDckQsSUFBSSxDQUFDLE1BQU07aUJBQ1osQ0FBQyxDQUFDO3FCQUM5QyxNQUFNLEVBQUU7YUFDZCxDQUFDO1NBQ2hCLENBQUM7SUFDSixDQUFDO0lBQ0QsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsZUFBZSxFQUFFLHVCQUF1QixDQUFDLE1BQU0sQ0FBQztRQUNsRCxJQUFJLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDO2FBQ3JCLFdBQVcsQ0FBQyxTQUFTLENBQUMsaUJBQWlCLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FDL0MsQ0FBQyxLQUFLLEtBQUssQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQ25FLENBQUMsRUFDRSxDQUFDLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1NBQ2pFLFVBQVUsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUNqRSxDQUFDO0FBRUQsOEJBQThCLElBQWlCO0lBQzdDLElBQUksb0JBQW9CLEdBQWlCLENBQUMsQ0FBQyxTQUFTLENBQUM7SUFDckQsSUFBSSxxQkFBcUIsR0FBRyxFQUFFLENBQUM7SUFDL0IsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsS0FBSyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUN6QyxvQkFBb0IsR0FBRyxjQUFjLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FDckQsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDekYscUJBQXFCLEdBQUc7WUFDdEIsbUJBQW1CLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDO2lCQUN4QyxVQUFVLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7U0FDN0YsQ0FBQztJQUNKLENBQUM7SUFDRCxJQUFJLFVBQXdCLENBQUM7SUFDN0IsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsS0FBSyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNwQyxVQUFVLEdBQW9CLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFFLENBQUMsVUFBVSxDQUFDO0lBQzFELENBQUM7SUFBQyxJQUFJLENBQUMsQ0FBQztRQUNOLFVBQVUsR0FBRyxDQUFDLENBQUMsU0FBUyxDQUFDO0lBQzNCLENBQUM7SUFDRCxNQUFNLENBQUMscUJBQXFCLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUM7U0FDMUQsTUFBTSxDQUFDO1FBQ04sQ0FBQyxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUNOO1lBQ0UsZUFBZSxDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQztZQUM1QyxDQUFDLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDckQsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDO1lBQzlCLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQztTQUNqQyxDQUFDO2FBQ3BCLE1BQU0sRUFBRTtRQUNiLElBQUksQ0FBQyxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUM7S0FDbEMsQ0FBQyxDQUFDO0FBQ1QsQ0FBQztBQUVELHFDQUFxQyxJQUFpQjtJQUNwRCxJQUFJLEtBQUssR0FBRyxFQUFFLENBQUM7SUFDZixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsMkJBQTJCLENBQUMsT0FBTyxFQUFFLElBQUksSUFBSSxDQUFDLDBCQUEwQixDQUFDLE9BQU8sRUFBRTtRQUN2RixJQUFJLENBQUMsb0NBQW9DLENBQUMsT0FBTyxFQUFFO1FBQ25ELElBQUksQ0FBQyxtQ0FBbUMsQ0FBQyxPQUFPLEVBQUU7UUFDbEQsSUFBSSxDQUFDLHVCQUF1QixDQUFDLE9BQU8sRUFBRSxJQUFJLElBQUksQ0FBQyxpQ0FBaUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDL0YsTUFBTSxDQUFDLEtBQUssQ0FBQztJQUNmLENBQUM7SUFDRCxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsMkJBQTJCLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUNyRSxLQUFLLENBQUMsSUFBSSxDQUNOLENBQUMsQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLDhCQUE4QixFQUFFLENBQUMsaUJBQWlCLENBQUMsYUFBYSxDQUFDLENBQUM7U0FDcEYsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUNuQixJQUFJLGlCQUFpQixHQUFHLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxNQUFNLENBQ25FLElBQUksQ0FBQyxvQ0FBb0MsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQ3hELEVBQUUsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2pDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsYUFBYSxDQUFDLEVBQUUsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO0lBQ3RGLENBQUM7SUFDRCxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsbUNBQW1DLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUM3RSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLDJCQUEyQixFQUFFLENBQUMsaUJBQWlCLENBQUMsYUFBYSxDQUFDLENBQUM7U0FDakYsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUMxQixJQUFJLGNBQWMsR0FDZCxJQUFJLENBQUMsdUJBQXVCLENBQUMsTUFBTSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxpQ0FBaUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQ2xHLEVBQUUsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM5QixLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLGFBQWEsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUM7SUFDbkYsQ0FBQztJQUVELElBQUksUUFBUSxHQUFHLEVBQUUsQ0FBQztJQUNsQixJQUFJLFFBQVEsR0FBRyxDQUFDLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDekMsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsaUJBQWlCLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM3RCxRQUFRLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztJQUN4RixDQUFDO0lBQ0QsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsaUJBQWlCLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM3RCxRQUFRLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQzthQUNyQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3hGLENBQUM7SUFDRCxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2xFLFFBQVEsQ0FBQyxJQUFJLENBQ1QsaUJBQWlCLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUM7YUFDdkYsVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3JELENBQUM7SUFDRCxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNoQyxDQUFDO0FBRUQsaUNBQWlDLFVBQXlCLEVBQUUsS0FBbUI7SUFDN0UsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzFCLE1BQU0sQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMzRCxDQUFDO0lBQUMsSUFBSSxDQUFDLENBQUM7UUFDTixNQUFNLENBQUMsVUFBVSxDQUFDO0lBQ3BCLENBQUM7QUFDSCxDQUFDO0FBRUQsd0JBQXdCLElBQWlCO0lBQ3ZDLElBQUksUUFBUSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDO0lBQ25DLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxZQUFZLEdBQUcsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUNuRSxDQUFDO0FBRUQsZ0NBQWdDLElBQWlCO0lBQy9DLElBQUksSUFBNkIsQ0FBQztJQUNsQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxLQUFLLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQ3pDLElBQUksR0FBRyxnQ0FBZ0MsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLGVBQWUsQ0FBQztZQUM1RCx1QkFBdUIsQ0FBQyxXQUFXO1lBQ25DLHVCQUF1QixDQUFDLFNBQVMsQ0FBQztJQUMvQyxDQUFDO0lBQUMsSUFBSSxDQUFDLENBQUM7UUFDTixJQUFJLEdBQUcsdUJBQXVCLENBQUMsV0FBVyxDQUFDO0lBQzdDLENBQUM7SUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDO0FBQ2QsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7aXNQcmVzZW50LCBpc0JsYW5rLCBTdHJpbmdXcmFwcGVyfSBmcm9tICdhbmd1bGFyMi9zcmMvZmFjYWRlL2xhbmcnO1xuaW1wb3J0IHtMaXN0V3JhcHBlciwgU3RyaW5nTWFwV3JhcHBlciwgU2V0V3JhcHBlcn0gZnJvbSAnYW5ndWxhcjIvc3JjL2ZhY2FkZS9jb2xsZWN0aW9uJztcblxuaW1wb3J0ICogYXMgbyBmcm9tICcuLi9vdXRwdXQvb3V0cHV0X2FzdCc7XG5pbXBvcnQge0lkZW50aWZpZXJzLCBpZGVudGlmaWVyVG9rZW59IGZyb20gJy4uL2lkZW50aWZpZXJzJztcbmltcG9ydCB7XG4gIFZpZXdDb25zdHJ1Y3RvclZhcnMsXG4gIEluamVjdE1ldGhvZFZhcnMsXG4gIERldGVjdENoYW5nZXNWYXJzLFxuICBWaWV3VHlwZUVudW0sXG4gIFZpZXdFbmNhcHN1bGF0aW9uRW51bSxcbiAgQ2hhbmdlRGV0ZWN0aW9uU3RyYXRlZ3lFbnVtLFxuICBWaWV3UHJvcGVydGllc1xufSBmcm9tICcuL2NvbnN0YW50cyc7XG5pbXBvcnQge1xuICBDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneSxcbiAgaXNEZWZhdWx0Q2hhbmdlRGV0ZWN0aW9uU3RyYXRlZ3lcbn0gZnJvbSAnYW5ndWxhcjIvc3JjL2NvcmUvY2hhbmdlX2RldGVjdGlvbi9jaGFuZ2VfZGV0ZWN0aW9uJztcblxuaW1wb3J0IHtDb21waWxlVmlld30gZnJvbSAnLi9jb21waWxlX3ZpZXcnO1xuaW1wb3J0IHtDb21waWxlRWxlbWVudCwgQ29tcGlsZU5vZGV9IGZyb20gJy4vY29tcGlsZV9lbGVtZW50JztcblxuaW1wb3J0IHtcbiAgVGVtcGxhdGVBc3QsXG4gIFRlbXBsYXRlQXN0VmlzaXRvcixcbiAgTmdDb250ZW50QXN0LFxuICBFbWJlZGRlZFRlbXBsYXRlQXN0LFxuICBFbGVtZW50QXN0LFxuICBSZWZlcmVuY2VBc3QsXG4gIFZhcmlhYmxlQXN0LFxuICBCb3VuZEV2ZW50QXN0LFxuICBCb3VuZEVsZW1lbnRQcm9wZXJ0eUFzdCxcbiAgQXR0ckFzdCxcbiAgQm91bmRUZXh0QXN0LFxuICBUZXh0QXN0LFxuICBEaXJlY3RpdmVBc3QsXG4gIEJvdW5kRGlyZWN0aXZlUHJvcGVydHlBc3QsXG4gIHRlbXBsYXRlVmlzaXRBbGwsXG4gIFByb3BlcnR5QmluZGluZ1R5cGUsXG4gIFByb3ZpZGVyQXN0XG59IGZyb20gJy4uL3RlbXBsYXRlX2FzdCc7XG5cbmltcG9ydCB7Z2V0Vmlld0ZhY3RvcnlOYW1lLCBjcmVhdGVGbGF0QXJyYXksIGNyZWF0ZURpVG9rZW5FeHByZXNzaW9ufSBmcm9tICcuL3V0aWwnO1xuXG5pbXBvcnQge1ZpZXdUeXBlfSBmcm9tICdhbmd1bGFyMi9zcmMvY29yZS9saW5rZXIvdmlld190eXBlJztcbmltcG9ydCB7Vmlld0VuY2Fwc3VsYXRpb259IGZyb20gJ2FuZ3VsYXIyL3NyYy9jb3JlL21ldGFkYXRhL3ZpZXcnO1xuXG5pbXBvcnQge1xuICBDb21waWxlSWRlbnRpZmllck1ldGFkYXRhLFxuICBDb21waWxlRGlyZWN0aXZlTWV0YWRhdGEsXG4gIENvbXBpbGVUb2tlbk1ldGFkYXRhXG59IGZyb20gJy4uL2NvbXBpbGVfbWV0YWRhdGEnO1xuXG5jb25zdCBJTVBMSUNJVF9URU1QTEFURV9WQVIgPSAnXFwkaW1wbGljaXQnO1xuY29uc3QgQ0xBU1NfQVRUUiA9ICdjbGFzcyc7XG5jb25zdCBTVFlMRV9BVFRSID0gJ3N0eWxlJztcblxudmFyIHBhcmVudFJlbmRlck5vZGVWYXIgPSBvLnZhcmlhYmxlKCdwYXJlbnRSZW5kZXJOb2RlJyk7XG52YXIgcm9vdFNlbGVjdG9yVmFyID0gby52YXJpYWJsZSgncm9vdFNlbGVjdG9yJyk7XG5cbmV4cG9ydCBjbGFzcyBWaWV3Q29tcGlsZURlcGVuZGVuY3kge1xuICBjb25zdHJ1Y3RvcihwdWJsaWMgY29tcDogQ29tcGlsZURpcmVjdGl2ZU1ldGFkYXRhLFxuICAgICAgICAgICAgICBwdWJsaWMgZmFjdG9yeVBsYWNlaG9sZGVyOiBDb21waWxlSWRlbnRpZmllck1ldGFkYXRhKSB7fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRWaWV3KHZpZXc6IENvbXBpbGVWaWV3LCB0ZW1wbGF0ZTogVGVtcGxhdGVBc3RbXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0RGVwZW5kZW5jaWVzOiBWaWV3Q29tcGlsZURlcGVuZGVuY3lbXSk6IG51bWJlciB7XG4gIHZhciBidWlsZGVyVmlzaXRvciA9IG5ldyBWaWV3QnVpbGRlclZpc2l0b3IodmlldywgdGFyZ2V0RGVwZW5kZW5jaWVzKTtcbiAgdGVtcGxhdGVWaXNpdEFsbChidWlsZGVyVmlzaXRvciwgdGVtcGxhdGUsIHZpZXcuZGVjbGFyYXRpb25FbGVtZW50LmlzTnVsbCgpID9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2aWV3LmRlY2xhcmF0aW9uRWxlbWVudCA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmlldy5kZWNsYXJhdGlvbkVsZW1lbnQucGFyZW50KTtcbiAgcmV0dXJuIGJ1aWxkZXJWaXNpdG9yLm5lc3RlZFZpZXdDb3VudDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZpbmlzaFZpZXcodmlldzogQ29tcGlsZVZpZXcsIHRhcmdldFN0YXRlbWVudHM6IG8uU3RhdGVtZW50W10pIHtcbiAgdmlldy5hZnRlck5vZGVzKCk7XG4gIGNyZWF0ZVZpZXdUb3BMZXZlbFN0bXRzKHZpZXcsIHRhcmdldFN0YXRlbWVudHMpO1xuICB2aWV3Lm5vZGVzLmZvckVhY2goKG5vZGUpID0+IHtcbiAgICBpZiAobm9kZSBpbnN0YW5jZW9mIENvbXBpbGVFbGVtZW50ICYmIGlzUHJlc2VudChub2RlLmVtYmVkZGVkVmlldykpIHtcbiAgICAgIGZpbmlzaFZpZXcobm9kZS5lbWJlZGRlZFZpZXcsIHRhcmdldFN0YXRlbWVudHMpO1xuICAgIH1cbiAgfSk7XG59XG5cbmNsYXNzIFZpZXdCdWlsZGVyVmlzaXRvciBpbXBsZW1lbnRzIFRlbXBsYXRlQXN0VmlzaXRvciB7XG4gIG5lc3RlZFZpZXdDb3VudDogbnVtYmVyID0gMDtcblxuICBjb25zdHJ1Y3RvcihwdWJsaWMgdmlldzogQ29tcGlsZVZpZXcsIHB1YmxpYyB0YXJnZXREZXBlbmRlbmNpZXM6IFZpZXdDb21waWxlRGVwZW5kZW5jeVtdKSB7fVxuXG4gIHByaXZhdGUgX2lzUm9vdE5vZGUocGFyZW50OiBDb21waWxlRWxlbWVudCk6IGJvb2xlYW4geyByZXR1cm4gcGFyZW50LnZpZXcgIT09IHRoaXMudmlldzsgfVxuXG4gIHByaXZhdGUgX2FkZFJvb3ROb2RlQW5kUHJvamVjdChub2RlOiBDb21waWxlTm9kZSwgbmdDb250ZW50SW5kZXg6IG51bWJlcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudDogQ29tcGlsZUVsZW1lbnQpIHtcbiAgICB2YXIgdmNBcHBFbCA9XG4gICAgICAgIChub2RlIGluc3RhbmNlb2YgQ29tcGlsZUVsZW1lbnQgJiYgbm9kZS5oYXNWaWV3Q29udGFpbmVyKSA/IG5vZGUuYXBwRWxlbWVudCA6IG51bGw7XG4gICAgaWYgKHRoaXMuX2lzUm9vdE5vZGUocGFyZW50KSkge1xuICAgICAgLy8gc3RvcmUgYXBwRWxlbWVudCBhcyByb290IG5vZGUgb25seSBmb3IgVmlld0NvbnRhaW5lcnNcbiAgICAgIGlmICh0aGlzLnZpZXcudmlld1R5cGUgIT09IFZpZXdUeXBlLkNPTVBPTkVOVCkge1xuICAgICAgICB0aGlzLnZpZXcucm9vdE5vZGVzT3JBcHBFbGVtZW50cy5wdXNoKGlzUHJlc2VudCh2Y0FwcEVsKSA/IHZjQXBwRWwgOiBub2RlLnJlbmRlck5vZGUpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoaXNQcmVzZW50KHBhcmVudC5jb21wb25lbnQpICYmIGlzUHJlc2VudChuZ0NvbnRlbnRJbmRleCkpIHtcbiAgICAgIHBhcmVudC5hZGRDb250ZW50Tm9kZShuZ0NvbnRlbnRJbmRleCwgaXNQcmVzZW50KHZjQXBwRWwpID8gdmNBcHBFbCA6IG5vZGUucmVuZGVyTm9kZSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBfZ2V0UGFyZW50UmVuZGVyTm9kZShwYXJlbnQ6IENvbXBpbGVFbGVtZW50KTogby5FeHByZXNzaW9uIHtcbiAgICBpZiAodGhpcy5faXNSb290Tm9kZShwYXJlbnQpKSB7XG4gICAgICBpZiAodGhpcy52aWV3LnZpZXdUeXBlID09PSBWaWV3VHlwZS5DT01QT05FTlQpIHtcbiAgICAgICAgcmV0dXJuIHBhcmVudFJlbmRlck5vZGVWYXI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyByb290IG5vZGUgb2YgYW4gZW1iZWRkZWQvaG9zdCB2aWV3XG4gICAgICAgIHJldHVybiBvLk5VTExfRVhQUjtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGlzUHJlc2VudChwYXJlbnQuY29tcG9uZW50KSAmJlxuICAgICAgICAgICAgICAgICAgICAgcGFyZW50LmNvbXBvbmVudC50ZW1wbGF0ZS5lbmNhcHN1bGF0aW9uICE9PSBWaWV3RW5jYXBzdWxhdGlvbi5OYXRpdmUgP1xuICAgICAgICAgICAgICAgICBvLk5VTExfRVhQUiA6XG4gICAgICAgICAgICAgICAgIHBhcmVudC5yZW5kZXJOb2RlO1xuICAgIH1cbiAgfVxuXG4gIHZpc2l0Qm91bmRUZXh0KGFzdDogQm91bmRUZXh0QXN0LCBwYXJlbnQ6IENvbXBpbGVFbGVtZW50KTogYW55IHtcbiAgICByZXR1cm4gdGhpcy5fdmlzaXRUZXh0KGFzdCwgJycsIGFzdC5uZ0NvbnRlbnRJbmRleCwgcGFyZW50KTtcbiAgfVxuICB2aXNpdFRleHQoYXN0OiBUZXh0QXN0LCBwYXJlbnQ6IENvbXBpbGVFbGVtZW50KTogYW55IHtcbiAgICByZXR1cm4gdGhpcy5fdmlzaXRUZXh0KGFzdCwgYXN0LnZhbHVlLCBhc3QubmdDb250ZW50SW5kZXgsIHBhcmVudCk7XG4gIH1cbiAgcHJpdmF0ZSBfdmlzaXRUZXh0KGFzdDogVGVtcGxhdGVBc3QsIHZhbHVlOiBzdHJpbmcsIG5nQ29udGVudEluZGV4OiBudW1iZXIsXG4gICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IENvbXBpbGVFbGVtZW50KTogby5FeHByZXNzaW9uIHtcbiAgICB2YXIgZmllbGROYW1lID0gYF90ZXh0XyR7dGhpcy52aWV3Lm5vZGVzLmxlbmd0aH1gO1xuICAgIHRoaXMudmlldy5maWVsZHMucHVzaChuZXcgby5DbGFzc0ZpZWxkKGZpZWxkTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvLmltcG9ydFR5cGUodGhpcy52aWV3LmdlbkNvbmZpZy5yZW5kZXJUeXBlcy5yZW5kZXJUZXh0KSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbby5TdG10TW9kaWZpZXIuUHJpdmF0ZV0pKTtcbiAgICB2YXIgcmVuZGVyTm9kZSA9IG8uVEhJU19FWFBSLnByb3AoZmllbGROYW1lKTtcbiAgICB2YXIgY29tcGlsZU5vZGUgPSBuZXcgQ29tcGlsZU5vZGUocGFyZW50LCB0aGlzLnZpZXcsIHRoaXMudmlldy5ub2Rlcy5sZW5ndGgsIHJlbmRlck5vZGUsIGFzdCk7XG4gICAgdmFyIGNyZWF0ZVJlbmRlck5vZGUgPVxuICAgICAgICBvLlRISVNfRVhQUi5wcm9wKGZpZWxkTmFtZSlcbiAgICAgICAgICAgIC5zZXQoVmlld1Byb3BlcnRpZXMucmVuZGVyZXIuY2FsbE1ldGhvZChcbiAgICAgICAgICAgICAgICAnY3JlYXRlVGV4dCcsXG4gICAgICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgICAgdGhpcy5fZ2V0UGFyZW50UmVuZGVyTm9kZShwYXJlbnQpLFxuICAgICAgICAgICAgICAgICAgby5saXRlcmFsKHZhbHVlKSxcbiAgICAgICAgICAgICAgICAgIHRoaXMudmlldy5jcmVhdGVNZXRob2QucmVzZXREZWJ1Z0luZm9FeHByKHRoaXMudmlldy5ub2Rlcy5sZW5ndGgsIGFzdClcbiAgICAgICAgICAgICAgICBdKSlcbiAgICAgICAgICAgIC50b1N0bXQoKTtcbiAgICB0aGlzLnZpZXcubm9kZXMucHVzaChjb21waWxlTm9kZSk7XG4gICAgdGhpcy52aWV3LmNyZWF0ZU1ldGhvZC5hZGRTdG10KGNyZWF0ZVJlbmRlck5vZGUpO1xuICAgIHRoaXMuX2FkZFJvb3ROb2RlQW5kUHJvamVjdChjb21waWxlTm9kZSwgbmdDb250ZW50SW5kZXgsIHBhcmVudCk7XG4gICAgcmV0dXJuIHJlbmRlck5vZGU7XG4gIH1cblxuICB2aXNpdE5nQ29udGVudChhc3Q6IE5nQ29udGVudEFzdCwgcGFyZW50OiBDb21waWxlRWxlbWVudCk6IGFueSB7XG4gICAgLy8gdGhlIHByb2plY3RlZCBub2RlcyBvcmlnaW5hdGUgZnJvbSBhIGRpZmZlcmVudCB2aWV3LCBzbyB3ZSBkb24ndFxuICAgIC8vIGhhdmUgZGVidWcgaW5mb3JtYXRpb24gZm9yIHRoZW0uLi5cbiAgICB0aGlzLnZpZXcuY3JlYXRlTWV0aG9kLnJlc2V0RGVidWdJbmZvKG51bGwsIGFzdCk7XG4gICAgdmFyIHBhcmVudFJlbmRlck5vZGUgPSB0aGlzLl9nZXRQYXJlbnRSZW5kZXJOb2RlKHBhcmVudCk7XG4gICAgdmFyIG5vZGVzRXhwcmVzc2lvbiA9IFZpZXdQcm9wZXJ0aWVzLnByb2plY3RhYmxlTm9kZXMua2V5KFxuICAgICAgICBvLmxpdGVyYWwoYXN0LmluZGV4KSxcbiAgICAgICAgbmV3IG8uQXJyYXlUeXBlKG8uaW1wb3J0VHlwZSh0aGlzLnZpZXcuZ2VuQ29uZmlnLnJlbmRlclR5cGVzLnJlbmRlck5vZGUpKSk7XG4gICAgaWYgKHBhcmVudFJlbmRlck5vZGUgIT09IG8uTlVMTF9FWFBSKSB7XG4gICAgICB0aGlzLnZpZXcuY3JlYXRlTWV0aG9kLmFkZFN0bXQoXG4gICAgICAgICAgVmlld1Byb3BlcnRpZXMucmVuZGVyZXIuY2FsbE1ldGhvZChcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAncHJvamVjdE5vZGVzJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXJlbnRSZW5kZXJOb2RlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgby5pbXBvcnRFeHByKElkZW50aWZpZXJzLmZsYXR0ZW5OZXN0ZWRWaWV3UmVuZGVyTm9kZXMpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLmNhbGxGbihbbm9kZXNFeHByZXNzaW9uXSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBdKVxuICAgICAgICAgICAgICAudG9TdG10KCkpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5faXNSb290Tm9kZShwYXJlbnQpKSB7XG4gICAgICBpZiAodGhpcy52aWV3LnZpZXdUeXBlICE9PSBWaWV3VHlwZS5DT01QT05FTlQpIHtcbiAgICAgICAgLy8gc3RvcmUgcm9vdCBub2RlcyBvbmx5IGZvciBlbWJlZGRlZC9ob3N0IHZpZXdzXG4gICAgICAgIHRoaXMudmlldy5yb290Tm9kZXNPckFwcEVsZW1lbnRzLnB1c2gobm9kZXNFeHByZXNzaW9uKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKGlzUHJlc2VudChwYXJlbnQuY29tcG9uZW50KSAmJiBpc1ByZXNlbnQoYXN0Lm5nQ29udGVudEluZGV4KSkge1xuICAgICAgICBwYXJlbnQuYWRkQ29udGVudE5vZGUoYXN0Lm5nQ29udGVudEluZGV4LCBub2Rlc0V4cHJlc3Npb24pO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIHZpc2l0RWxlbWVudChhc3Q6IEVsZW1lbnRBc3QsIHBhcmVudDogQ29tcGlsZUVsZW1lbnQpOiBhbnkge1xuICAgIHZhciBub2RlSW5kZXggPSB0aGlzLnZpZXcubm9kZXMubGVuZ3RoO1xuICAgIHZhciBjcmVhdGVSZW5kZXJOb2RlRXhwcjtcbiAgICB2YXIgZGVidWdDb250ZXh0RXhwciA9IHRoaXMudmlldy5jcmVhdGVNZXRob2QucmVzZXREZWJ1Z0luZm9FeHByKG5vZGVJbmRleCwgYXN0KTtcbiAgICBpZiAobm9kZUluZGV4ID09PSAwICYmIHRoaXMudmlldy52aWV3VHlwZSA9PT0gVmlld1R5cGUuSE9TVCkge1xuICAgICAgY3JlYXRlUmVuZGVyTm9kZUV4cHIgPSBvLlRISVNfRVhQUi5jYWxsTWV0aG9kKFxuICAgICAgICAgICdzZWxlY3RPckNyZWF0ZUhvc3RFbGVtZW50JywgW28ubGl0ZXJhbChhc3QubmFtZSksIHJvb3RTZWxlY3RvclZhciwgZGVidWdDb250ZXh0RXhwcl0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBjcmVhdGVSZW5kZXJOb2RlRXhwciA9IFZpZXdQcm9wZXJ0aWVzLnJlbmRlcmVyLmNhbGxNZXRob2QoXG4gICAgICAgICAgJ2NyZWF0ZUVsZW1lbnQnLFxuICAgICAgICAgIFt0aGlzLl9nZXRQYXJlbnRSZW5kZXJOb2RlKHBhcmVudCksIG8ubGl0ZXJhbChhc3QubmFtZSksIGRlYnVnQ29udGV4dEV4cHJdKTtcbiAgICB9XG4gICAgdmFyIGZpZWxkTmFtZSA9IGBfZWxfJHtub2RlSW5kZXh9YDtcbiAgICB0aGlzLnZpZXcuZmllbGRzLnB1c2goXG4gICAgICAgIG5ldyBvLkNsYXNzRmllbGQoZmllbGROYW1lLCBvLmltcG9ydFR5cGUodGhpcy52aWV3LmdlbkNvbmZpZy5yZW5kZXJUeXBlcy5yZW5kZXJFbGVtZW50KSxcbiAgICAgICAgICAgICAgICAgICAgICAgICBbby5TdG10TW9kaWZpZXIuUHJpdmF0ZV0pKTtcbiAgICB0aGlzLnZpZXcuY3JlYXRlTWV0aG9kLmFkZFN0bXQoby5USElTX0VYUFIucHJvcChmaWVsZE5hbWUpLnNldChjcmVhdGVSZW5kZXJOb2RlRXhwcikudG9TdG10KCkpO1xuXG4gICAgdmFyIHJlbmRlck5vZGUgPSBvLlRISVNfRVhQUi5wcm9wKGZpZWxkTmFtZSk7XG5cbiAgICB2YXIgZGlyZWN0aXZlcyA9IGFzdC5kaXJlY3RpdmVzLm1hcChkaXJlY3RpdmVBc3QgPT4gZGlyZWN0aXZlQXN0LmRpcmVjdGl2ZSk7XG4gICAgdmFyIGNvbXBvbmVudCA9IGRpcmVjdGl2ZXMuZmluZChkaXJlY3RpdmUgPT4gZGlyZWN0aXZlLmlzQ29tcG9uZW50KTtcbiAgICB2YXIgaHRtbEF0dHJzID0gX3JlYWRIdG1sQXR0cnMoYXN0LmF0dHJzKTtcbiAgICB2YXIgYXR0ck5hbWVBbmRWYWx1ZXMgPSBfbWVyZ2VIdG1sQW5kRGlyZWN0aXZlQXR0cnMoaHRtbEF0dHJzLCBkaXJlY3RpdmVzKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGF0dHJOYW1lQW5kVmFsdWVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgYXR0ck5hbWUgPSBhdHRyTmFtZUFuZFZhbHVlc1tpXVswXTtcbiAgICAgIHZhciBhdHRyVmFsdWUgPSBhdHRyTmFtZUFuZFZhbHVlc1tpXVsxXTtcbiAgICAgIHRoaXMudmlldy5jcmVhdGVNZXRob2QuYWRkU3RtdChcbiAgICAgICAgICBWaWV3UHJvcGVydGllcy5yZW5kZXJlci5jYWxsTWV0aG9kKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdzZXRFbGVtZW50QXR0cmlidXRlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbcmVuZGVyTm9kZSwgby5saXRlcmFsKGF0dHJOYW1lKSwgby5saXRlcmFsKGF0dHJWYWx1ZSldKVxuICAgICAgICAgICAgICAudG9TdG10KCkpO1xuICAgIH1cbiAgICB2YXIgY29tcGlsZUVsZW1lbnQgPVxuICAgICAgICBuZXcgQ29tcGlsZUVsZW1lbnQocGFyZW50LCB0aGlzLnZpZXcsIG5vZGVJbmRleCwgcmVuZGVyTm9kZSwgYXN0LCBjb21wb25lbnQsIGRpcmVjdGl2ZXMsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBhc3QucHJvdmlkZXJzLCBhc3QuaGFzVmlld0NvbnRhaW5lciwgZmFsc2UsIGFzdC5yZWZlcmVuY2VzKTtcbiAgICB0aGlzLnZpZXcubm9kZXMucHVzaChjb21waWxlRWxlbWVudCk7XG4gICAgdmFyIGNvbXBWaWV3RXhwcjogby5SZWFkVmFyRXhwciA9IG51bGw7XG4gICAgaWYgKGlzUHJlc2VudChjb21wb25lbnQpKSB7XG4gICAgICB2YXIgbmVzdGVkQ29tcG9uZW50SWRlbnRpZmllciA9XG4gICAgICAgICAgbmV3IENvbXBpbGVJZGVudGlmaWVyTWV0YWRhdGEoe25hbWU6IGdldFZpZXdGYWN0b3J5TmFtZShjb21wb25lbnQsIDApfSk7XG4gICAgICB0aGlzLnRhcmdldERlcGVuZGVuY2llcy5wdXNoKG5ldyBWaWV3Q29tcGlsZURlcGVuZGVuY3koY29tcG9uZW50LCBuZXN0ZWRDb21wb25lbnRJZGVudGlmaWVyKSk7XG4gICAgICBjb21wVmlld0V4cHIgPSBvLnZhcmlhYmxlKGBjb21wVmlld18ke25vZGVJbmRleH1gKTtcbiAgICAgIGNvbXBpbGVFbGVtZW50LnNldENvbXBvbmVudFZpZXcoY29tcFZpZXdFeHByKTtcbiAgICAgIHRoaXMudmlldy5jcmVhdGVNZXRob2QuYWRkU3RtdChjb21wVmlld0V4cHIuc2V0KG8uaW1wb3J0RXhwcihuZXN0ZWRDb21wb25lbnRJZGVudGlmaWVyKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5jYWxsRm4oW1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgVmlld1Byb3BlcnRpZXMudmlld1V0aWxzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29tcGlsZUVsZW1lbnQuaW5qZWN0b3IsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb21waWxlRWxlbWVudC5hcHBFbGVtZW50XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXSkpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC50b0RlY2xTdG10KCkpO1xuICAgIH1cbiAgICBjb21waWxlRWxlbWVudC5iZWZvcmVDaGlsZHJlbigpO1xuICAgIHRoaXMuX2FkZFJvb3ROb2RlQW5kUHJvamVjdChjb21waWxlRWxlbWVudCwgYXN0Lm5nQ29udGVudEluZGV4LCBwYXJlbnQpO1xuICAgIHRlbXBsYXRlVmlzaXRBbGwodGhpcywgYXN0LmNoaWxkcmVuLCBjb21waWxlRWxlbWVudCk7XG4gICAgY29tcGlsZUVsZW1lbnQuYWZ0ZXJDaGlsZHJlbih0aGlzLnZpZXcubm9kZXMubGVuZ3RoIC0gbm9kZUluZGV4IC0gMSk7XG5cbiAgICBpZiAoaXNQcmVzZW50KGNvbXBWaWV3RXhwcikpIHtcbiAgICAgIHZhciBjb2RlR2VuQ29udGVudE5vZGVzO1xuICAgICAgaWYgKHRoaXMudmlldy5jb21wb25lbnQudHlwZS5pc0hvc3QpIHtcbiAgICAgICAgY29kZUdlbkNvbnRlbnROb2RlcyA9IFZpZXdQcm9wZXJ0aWVzLnByb2plY3RhYmxlTm9kZXM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb2RlR2VuQ29udGVudE5vZGVzID0gby5saXRlcmFsQXJyKFxuICAgICAgICAgICAgY29tcGlsZUVsZW1lbnQuY29udGVudE5vZGVzQnlOZ0NvbnRlbnRJbmRleC5tYXAobm9kZXMgPT4gY3JlYXRlRmxhdEFycmF5KG5vZGVzKSkpO1xuICAgICAgfVxuICAgICAgdGhpcy52aWV3LmNyZWF0ZU1ldGhvZC5hZGRTdG10KFxuICAgICAgICAgIGNvbXBWaWV3RXhwci5jYWxsTWV0aG9kKCdjcmVhdGUnLCBbY29kZUdlbkNvbnRlbnROb2Rlcywgby5OVUxMX0VYUFJdKS50b1N0bXQoKSk7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgdmlzaXRFbWJlZGRlZFRlbXBsYXRlKGFzdDogRW1iZWRkZWRUZW1wbGF0ZUFzdCwgcGFyZW50OiBDb21waWxlRWxlbWVudCk6IGFueSB7XG4gICAgdmFyIG5vZGVJbmRleCA9IHRoaXMudmlldy5ub2Rlcy5sZW5ndGg7XG4gICAgdmFyIGZpZWxkTmFtZSA9IGBfYW5jaG9yXyR7bm9kZUluZGV4fWA7XG4gICAgdGhpcy52aWV3LmZpZWxkcy5wdXNoKFxuICAgICAgICBuZXcgby5DbGFzc0ZpZWxkKGZpZWxkTmFtZSwgby5pbXBvcnRUeXBlKHRoaXMudmlldy5nZW5Db25maWcucmVuZGVyVHlwZXMucmVuZGVyQ29tbWVudCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgW28uU3RtdE1vZGlmaWVyLlByaXZhdGVdKSk7XG4gICAgdGhpcy52aWV3LmNyZWF0ZU1ldGhvZC5hZGRTdG10KFxuICAgICAgICBvLlRISVNfRVhQUi5wcm9wKGZpZWxkTmFtZSlcbiAgICAgICAgICAgIC5zZXQoVmlld1Byb3BlcnRpZXMucmVuZGVyZXIuY2FsbE1ldGhvZChcbiAgICAgICAgICAgICAgICAnY3JlYXRlVGVtcGxhdGVBbmNob3InLFxuICAgICAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgICAgIHRoaXMuX2dldFBhcmVudFJlbmRlck5vZGUocGFyZW50KSxcbiAgICAgICAgICAgICAgICAgIHRoaXMudmlldy5jcmVhdGVNZXRob2QucmVzZXREZWJ1Z0luZm9FeHByKG5vZGVJbmRleCwgYXN0KVxuICAgICAgICAgICAgICAgIF0pKVxuICAgICAgICAgICAgLnRvU3RtdCgpKTtcbiAgICB2YXIgcmVuZGVyTm9kZSA9IG8uVEhJU19FWFBSLnByb3AoZmllbGROYW1lKTtcblxuICAgIHZhciB0ZW1wbGF0ZVZhcmlhYmxlQmluZGluZ3MgPSBhc3QudmFyaWFibGVzLm1hcChcbiAgICAgICAgdmFyQXN0ID0+IFt2YXJBc3QudmFsdWUubGVuZ3RoID4gMCA/IHZhckFzdC52YWx1ZSA6IElNUExJQ0lUX1RFTVBMQVRFX1ZBUiwgdmFyQXN0Lm5hbWVdKTtcblxuICAgIHZhciBkaXJlY3RpdmVzID0gYXN0LmRpcmVjdGl2ZXMubWFwKGRpcmVjdGl2ZUFzdCA9PiBkaXJlY3RpdmVBc3QuZGlyZWN0aXZlKTtcbiAgICB2YXIgY29tcGlsZUVsZW1lbnQgPVxuICAgICAgICBuZXcgQ29tcGlsZUVsZW1lbnQocGFyZW50LCB0aGlzLnZpZXcsIG5vZGVJbmRleCwgcmVuZGVyTm9kZSwgYXN0LCBudWxsLCBkaXJlY3RpdmVzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgYXN0LnByb3ZpZGVycywgYXN0Lmhhc1ZpZXdDb250YWluZXIsIHRydWUsIGFzdC5yZWZlcmVuY2VzKTtcbiAgICB0aGlzLnZpZXcubm9kZXMucHVzaChjb21waWxlRWxlbWVudCk7XG5cbiAgICB0aGlzLm5lc3RlZFZpZXdDb3VudCsrO1xuICAgIHZhciBlbWJlZGRlZFZpZXcgPSBuZXcgQ29tcGlsZVZpZXcoXG4gICAgICAgIHRoaXMudmlldy5jb21wb25lbnQsIHRoaXMudmlldy5nZW5Db25maWcsIHRoaXMudmlldy5waXBlTWV0YXMsIG8uTlVMTF9FWFBSLFxuICAgICAgICB0aGlzLnZpZXcudmlld0luZGV4ICsgdGhpcy5uZXN0ZWRWaWV3Q291bnQsIGNvbXBpbGVFbGVtZW50LCB0ZW1wbGF0ZVZhcmlhYmxlQmluZGluZ3MpO1xuICAgIHRoaXMubmVzdGVkVmlld0NvdW50ICs9IGJ1aWxkVmlldyhlbWJlZGRlZFZpZXcsIGFzdC5jaGlsZHJlbiwgdGhpcy50YXJnZXREZXBlbmRlbmNpZXMpO1xuXG4gICAgY29tcGlsZUVsZW1lbnQuYmVmb3JlQ2hpbGRyZW4oKTtcbiAgICB0aGlzLl9hZGRSb290Tm9kZUFuZFByb2plY3QoY29tcGlsZUVsZW1lbnQsIGFzdC5uZ0NvbnRlbnRJbmRleCwgcGFyZW50KTtcbiAgICBjb21waWxlRWxlbWVudC5hZnRlckNoaWxkcmVuKDApO1xuXG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICB2aXNpdEF0dHIoYXN0OiBBdHRyQXN0LCBjdHg6IGFueSk6IGFueSB7IHJldHVybiBudWxsOyB9XG4gIHZpc2l0RGlyZWN0aXZlKGFzdDogRGlyZWN0aXZlQXN0LCBjdHg6IGFueSk6IGFueSB7IHJldHVybiBudWxsOyB9XG4gIHZpc2l0RXZlbnQoYXN0OiBCb3VuZEV2ZW50QXN0LCBldmVudFRhcmdldEFuZE5hbWVzOiBNYXA8c3RyaW5nLCBCb3VuZEV2ZW50QXN0Pik6IGFueSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICB2aXNpdFJlZmVyZW5jZShhc3Q6IFJlZmVyZW5jZUFzdCwgY3R4OiBhbnkpOiBhbnkgeyByZXR1cm4gbnVsbDsgfVxuICB2aXNpdFZhcmlhYmxlKGFzdDogVmFyaWFibGVBc3QsIGN0eDogYW55KTogYW55IHsgcmV0dXJuIG51bGw7IH1cbiAgdmlzaXREaXJlY3RpdmVQcm9wZXJ0eShhc3Q6IEJvdW5kRGlyZWN0aXZlUHJvcGVydHlBc3QsIGNvbnRleHQ6IGFueSk6IGFueSB7IHJldHVybiBudWxsOyB9XG4gIHZpc2l0RWxlbWVudFByb3BlcnR5KGFzdDogQm91bmRFbGVtZW50UHJvcGVydHlBc3QsIGNvbnRleHQ6IGFueSk6IGFueSB7IHJldHVybiBudWxsOyB9XG59XG5cbmZ1bmN0aW9uIF9tZXJnZUh0bWxBbmREaXJlY3RpdmVBdHRycyhkZWNsYXJlZEh0bWxBdHRyczoge1trZXk6IHN0cmluZ106IHN0cmluZ30sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGlyZWN0aXZlczogQ29tcGlsZURpcmVjdGl2ZU1ldGFkYXRhW10pOiBzdHJpbmdbXVtdIHtcbiAgdmFyIHJlc3VsdDoge1trZXk6IHN0cmluZ106IHN0cmluZ30gPSB7fTtcbiAgU3RyaW5nTWFwV3JhcHBlci5mb3JFYWNoKGRlY2xhcmVkSHRtbEF0dHJzLCAodmFsdWUsIGtleSkgPT4geyByZXN1bHRba2V5XSA9IHZhbHVlOyB9KTtcbiAgZGlyZWN0aXZlcy5mb3JFYWNoKGRpcmVjdGl2ZU1ldGEgPT4ge1xuICAgIFN0cmluZ01hcFdyYXBwZXIuZm9yRWFjaChkaXJlY3RpdmVNZXRhLmhvc3RBdHRyaWJ1dGVzLCAodmFsdWUsIG5hbWUpID0+IHtcbiAgICAgIHZhciBwcmV2VmFsdWUgPSByZXN1bHRbbmFtZV07XG4gICAgICByZXN1bHRbbmFtZV0gPSBpc1ByZXNlbnQocHJldlZhbHVlKSA/IG1lcmdlQXR0cmlidXRlVmFsdWUobmFtZSwgcHJldlZhbHVlLCB2YWx1ZSkgOiB2YWx1ZTtcbiAgICB9KTtcbiAgfSk7XG4gIHJldHVybiBtYXBUb0tleVZhbHVlQXJyYXkocmVzdWx0KTtcbn1cblxuZnVuY3Rpb24gX3JlYWRIdG1sQXR0cnMoYXR0cnM6IEF0dHJBc3RbXSk6IHtba2V5OiBzdHJpbmddOiBzdHJpbmd9IHtcbiAgdmFyIGh0bWxBdHRyczoge1trZXk6IHN0cmluZ106IHN0cmluZ30gPSB7fTtcbiAgYXR0cnMuZm9yRWFjaCgoYXN0KSA9PiB7IGh0bWxBdHRyc1thc3QubmFtZV0gPSBhc3QudmFsdWU7IH0pO1xuICByZXR1cm4gaHRtbEF0dHJzO1xufVxuXG5mdW5jdGlvbiBtZXJnZUF0dHJpYnV0ZVZhbHVlKGF0dHJOYW1lOiBzdHJpbmcsIGF0dHJWYWx1ZTE6IHN0cmluZywgYXR0clZhbHVlMjogc3RyaW5nKTogc3RyaW5nIHtcbiAgaWYgKGF0dHJOYW1lID09IENMQVNTX0FUVFIgfHwgYXR0ck5hbWUgPT0gU1RZTEVfQVRUUikge1xuICAgIHJldHVybiBgJHthdHRyVmFsdWUxfSAke2F0dHJWYWx1ZTJ9YDtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gYXR0clZhbHVlMjtcbiAgfVxufVxuXG5mdW5jdGlvbiBtYXBUb0tleVZhbHVlQXJyYXkoZGF0YToge1trZXk6IHN0cmluZ106IHN0cmluZ30pOiBzdHJpbmdbXVtdIHtcbiAgdmFyIGVudHJ5QXJyYXkgPSBbXTtcbiAgU3RyaW5nTWFwV3JhcHBlci5mb3JFYWNoKGRhdGEsICh2YWx1ZSwgbmFtZSkgPT4geyBlbnRyeUFycmF5LnB1c2goW25hbWUsIHZhbHVlXSk7IH0pO1xuICAvLyBXZSBuZWVkIHRvIHNvcnQgdG8gZ2V0IGEgZGVmaW5lZCBvdXRwdXQgb3JkZXJcbiAgLy8gZm9yIHRlc3RzIGFuZCBmb3IgY2FjaGluZyBnZW5lcmF0ZWQgYXJ0aWZhY3RzLi4uXG4gIExpc3RXcmFwcGVyLnNvcnQoZW50cnlBcnJheSwgKGVudHJ5MSwgZW50cnkyKSA9PiBTdHJpbmdXcmFwcGVyLmNvbXBhcmUoZW50cnkxWzBdLCBlbnRyeTJbMF0pKTtcbiAgdmFyIGtleVZhbHVlQXJyYXkgPSBbXTtcbiAgZW50cnlBcnJheS5mb3JFYWNoKChlbnRyeSkgPT4geyBrZXlWYWx1ZUFycmF5LnB1c2goW2VudHJ5WzBdLCBlbnRyeVsxXV0pOyB9KTtcbiAgcmV0dXJuIGtleVZhbHVlQXJyYXk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVZpZXdUb3BMZXZlbFN0bXRzKHZpZXc6IENvbXBpbGVWaWV3LCB0YXJnZXRTdGF0ZW1lbnRzOiBvLlN0YXRlbWVudFtdKSB7XG4gIHZhciBub2RlRGVidWdJbmZvc1Zhcjogby5FeHByZXNzaW9uID0gby5OVUxMX0VYUFI7XG4gIGlmICh2aWV3LmdlbkNvbmZpZy5nZW5EZWJ1Z0luZm8pIHtcbiAgICBub2RlRGVidWdJbmZvc1ZhciA9IG8udmFyaWFibGUoYG5vZGVEZWJ1Z0luZm9zXyR7dmlldy5jb21wb25lbnQudHlwZS5uYW1lfSR7dmlldy52aWV3SW5kZXh9YCk7XG4gICAgdGFyZ2V0U3RhdGVtZW50cy5wdXNoKFxuICAgICAgICAoPG8uUmVhZFZhckV4cHI+bm9kZURlYnVnSW5mb3NWYXIpXG4gICAgICAgICAgICAuc2V0KG8ubGl0ZXJhbEFycih2aWV3Lm5vZGVzLm1hcChjcmVhdGVTdGF0aWNOb2RlRGVidWdJbmZvKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBvLkFycmF5VHlwZShuZXcgby5FeHRlcm5hbFR5cGUoSWRlbnRpZmllcnMuU3RhdGljTm9kZURlYnVnSW5mbyksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgW28uVHlwZU1vZGlmaWVyLkNvbnN0XSkpKVxuICAgICAgICAgICAgLnRvRGVjbFN0bXQobnVsbCwgW28uU3RtdE1vZGlmaWVyLkZpbmFsXSkpO1xuICB9XG5cblxuICB2YXIgcmVuZGVyQ29tcFR5cGVWYXI6IG8uUmVhZFZhckV4cHIgPSBvLnZhcmlhYmxlKGByZW5kZXJUeXBlXyR7dmlldy5jb21wb25lbnQudHlwZS5uYW1lfWApO1xuICBpZiAodmlldy52aWV3SW5kZXggPT09IDApIHtcbiAgICB0YXJnZXRTdGF0ZW1lbnRzLnB1c2gocmVuZGVyQ29tcFR5cGVWYXIuc2V0KG8uTlVMTF9FWFBSKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnRvRGVjbFN0bXQoby5pbXBvcnRUeXBlKElkZW50aWZpZXJzLlJlbmRlckNvbXBvbmVudFR5cGUpKSk7XG4gIH1cblxuICB2YXIgdmlld0NsYXNzID0gY3JlYXRlVmlld0NsYXNzKHZpZXcsIHJlbmRlckNvbXBUeXBlVmFyLCBub2RlRGVidWdJbmZvc1Zhcik7XG4gIHRhcmdldFN0YXRlbWVudHMucHVzaCh2aWV3Q2xhc3MpO1xuICB0YXJnZXRTdGF0ZW1lbnRzLnB1c2goY3JlYXRlVmlld0ZhY3Rvcnkodmlldywgdmlld0NsYXNzLCByZW5kZXJDb21wVHlwZVZhcikpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVTdGF0aWNOb2RlRGVidWdJbmZvKG5vZGU6IENvbXBpbGVOb2RlKTogby5FeHByZXNzaW9uIHtcbiAgdmFyIGNvbXBpbGVFbGVtZW50ID0gbm9kZSBpbnN0YW5jZW9mIENvbXBpbGVFbGVtZW50ID8gbm9kZSA6IG51bGw7XG4gIHZhciBwcm92aWRlclRva2Vuczogby5FeHByZXNzaW9uW10gPSBbXTtcbiAgdmFyIGNvbXBvbmVudFRva2VuOiBvLkV4cHJlc3Npb24gPSBvLk5VTExfRVhQUjtcbiAgdmFyIHZhclRva2VuRW50cmllcyA9IFtdO1xuICBpZiAoaXNQcmVzZW50KGNvbXBpbGVFbGVtZW50KSkge1xuICAgIHByb3ZpZGVyVG9rZW5zID0gY29tcGlsZUVsZW1lbnQuZ2V0UHJvdmlkZXJUb2tlbnMoKTtcbiAgICBpZiAoaXNQcmVzZW50KGNvbXBpbGVFbGVtZW50LmNvbXBvbmVudCkpIHtcbiAgICAgIGNvbXBvbmVudFRva2VuID0gY3JlYXRlRGlUb2tlbkV4cHJlc3Npb24oaWRlbnRpZmllclRva2VuKGNvbXBpbGVFbGVtZW50LmNvbXBvbmVudC50eXBlKSk7XG4gICAgfVxuICAgIFN0cmluZ01hcFdyYXBwZXIuZm9yRWFjaChjb21waWxlRWxlbWVudC5yZWZlcmVuY2VUb2tlbnMsICh0b2tlbiwgdmFyTmFtZSkgPT4ge1xuICAgICAgdmFyVG9rZW5FbnRyaWVzLnB1c2goXG4gICAgICAgICAgW3Zhck5hbWUsIGlzUHJlc2VudCh0b2tlbikgPyBjcmVhdGVEaVRva2VuRXhwcmVzc2lvbih0b2tlbikgOiBvLk5VTExfRVhQUl0pO1xuICAgIH0pO1xuICB9XG4gIHJldHVybiBvLmltcG9ydEV4cHIoSWRlbnRpZmllcnMuU3RhdGljTm9kZURlYnVnSW5mbylcbiAgICAgIC5pbnN0YW50aWF0ZShcbiAgICAgICAgICBbXG4gICAgICAgICAgICBvLmxpdGVyYWxBcnIocHJvdmlkZXJUb2tlbnMsIG5ldyBvLkFycmF5VHlwZShvLkRZTkFNSUNfVFlQRSwgW28uVHlwZU1vZGlmaWVyLkNvbnN0XSkpLFxuICAgICAgICAgICAgY29tcG9uZW50VG9rZW4sXG4gICAgICAgICAgICBvLmxpdGVyYWxNYXAodmFyVG9rZW5FbnRyaWVzLCBuZXcgby5NYXBUeXBlKG8uRFlOQU1JQ19UWVBFLCBbby5UeXBlTW9kaWZpZXIuQ29uc3RdKSlcbiAgICAgICAgICBdLFxuICAgICAgICAgIG8uaW1wb3J0VHlwZShJZGVudGlmaWVycy5TdGF0aWNOb2RlRGVidWdJbmZvLCBudWxsLCBbby5UeXBlTW9kaWZpZXIuQ29uc3RdKSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVZpZXdDbGFzcyh2aWV3OiBDb21waWxlVmlldywgcmVuZGVyQ29tcFR5cGVWYXI6IG8uUmVhZFZhckV4cHIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgbm9kZURlYnVnSW5mb3NWYXI6IG8uRXhwcmVzc2lvbik6IG8uQ2xhc3NTdG10IHtcbiAgdmFyIGVtcHR5VGVtcGxhdGVWYXJpYWJsZUJpbmRpbmdzID1cbiAgICAgIHZpZXcudGVtcGxhdGVWYXJpYWJsZUJpbmRpbmdzLm1hcCgoZW50cnkpID0+IFtlbnRyeVswXSwgby5OVUxMX0VYUFJdKTtcbiAgdmFyIHZpZXdDb25zdHJ1Y3RvckFyZ3MgPSBbXG4gICAgbmV3IG8uRm5QYXJhbShWaWV3Q29uc3RydWN0b3JWYXJzLnZpZXdVdGlscy5uYW1lLCBvLmltcG9ydFR5cGUoSWRlbnRpZmllcnMuVmlld1V0aWxzKSksXG4gICAgbmV3IG8uRm5QYXJhbShWaWV3Q29uc3RydWN0b3JWYXJzLnBhcmVudEluamVjdG9yLm5hbWUsIG8uaW1wb3J0VHlwZShJZGVudGlmaWVycy5JbmplY3RvcikpLFxuICAgIG5ldyBvLkZuUGFyYW0oVmlld0NvbnN0cnVjdG9yVmFycy5kZWNsYXJhdGlvbkVsLm5hbWUsIG8uaW1wb3J0VHlwZShJZGVudGlmaWVycy5BcHBFbGVtZW50KSlcbiAgXTtcbiAgdmFyIHN1cGVyQ29uc3RydWN0b3JBcmdzID0gW1xuICAgIG8udmFyaWFibGUodmlldy5jbGFzc05hbWUpLFxuICAgIHJlbmRlckNvbXBUeXBlVmFyLFxuICAgIFZpZXdUeXBlRW51bS5mcm9tVmFsdWUodmlldy52aWV3VHlwZSksXG4gICAgby5saXRlcmFsTWFwKGVtcHR5VGVtcGxhdGVWYXJpYWJsZUJpbmRpbmdzKSxcbiAgICBWaWV3Q29uc3RydWN0b3JWYXJzLnZpZXdVdGlscyxcbiAgICBWaWV3Q29uc3RydWN0b3JWYXJzLnBhcmVudEluamVjdG9yLFxuICAgIFZpZXdDb25zdHJ1Y3RvclZhcnMuZGVjbGFyYXRpb25FbCxcbiAgICBDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneUVudW0uZnJvbVZhbHVlKGdldENoYW5nZURldGVjdGlvbk1vZGUodmlldykpLFxuICBdO1xuICBpZiAodmlldy5nZW5Db25maWcuZ2VuRGVidWdJbmZvKSB7XG4gICAgc3VwZXJDb25zdHJ1Y3RvckFyZ3MucHVzaChub2RlRGVidWdJbmZvc1Zhcik7XG4gIH1cbiAgdmFyIHZpZXdDb25zdHJ1Y3RvciA9IG5ldyBvLkNsYXNzTWV0aG9kKG51bGwsIHZpZXdDb25zdHJ1Y3RvckFyZ3MsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbby5TVVBFUl9FWFBSLmNhbGxGbihzdXBlckNvbnN0cnVjdG9yQXJncykudG9TdG10KCldKTtcblxuICB2YXIgdmlld01ldGhvZHMgPSBbXG4gICAgbmV3IG8uQ2xhc3NNZXRob2QoJ2NyZWF0ZUludGVybmFsJywgW25ldyBvLkZuUGFyYW0ocm9vdFNlbGVjdG9yVmFyLm5hbWUsIG8uRFlOQU1JQ19UWVBFKV0sXG4gICAgICAgICAgICAgICAgICAgICAgZ2VuZXJhdGVDcmVhdGVNZXRob2QodmlldyksIG8uaW1wb3J0VHlwZShJZGVudGlmaWVycy5BcHBFbGVtZW50KSksXG4gICAgbmV3IG8uQ2xhc3NNZXRob2QoXG4gICAgICAgICdpbmplY3RvckdldEludGVybmFsJyxcbiAgICAgICAgW1xuICAgICAgICAgIG5ldyBvLkZuUGFyYW0oSW5qZWN0TWV0aG9kVmFycy50b2tlbi5uYW1lLCBvLkRZTkFNSUNfVFlQRSksXG4gICAgICAgICAgLy8gTm90ZTogQ2FuJ3QgdXNlIG8uSU5UX1RZUEUgaGVyZSBhcyB0aGUgbWV0aG9kIGluIEFwcFZpZXcgdXNlcyBudW1iZXJcbiAgICAgICAgICBuZXcgby5GblBhcmFtKEluamVjdE1ldGhvZFZhcnMucmVxdWVzdE5vZGVJbmRleC5uYW1lLCBvLk5VTUJFUl9UWVBFKSxcbiAgICAgICAgICBuZXcgby5GblBhcmFtKEluamVjdE1ldGhvZFZhcnMubm90Rm91bmRSZXN1bHQubmFtZSwgby5EWU5BTUlDX1RZUEUpXG4gICAgICAgIF0sXG4gICAgICAgIGFkZFJldHVyblZhbHVlZk5vdEVtcHR5KHZpZXcuaW5qZWN0b3JHZXRNZXRob2QuZmluaXNoKCksIEluamVjdE1ldGhvZFZhcnMubm90Rm91bmRSZXN1bHQpLFxuICAgICAgICBvLkRZTkFNSUNfVFlQRSksXG4gICAgbmV3IG8uQ2xhc3NNZXRob2QoJ2RldGVjdENoYW5nZXNJbnRlcm5hbCcsXG4gICAgICAgICAgICAgICAgICAgICAgW25ldyBvLkZuUGFyYW0oRGV0ZWN0Q2hhbmdlc1ZhcnMudGhyb3dPbkNoYW5nZS5uYW1lLCBvLkJPT0xfVFlQRSldLFxuICAgICAgICAgICAgICAgICAgICAgIGdlbmVyYXRlRGV0ZWN0Q2hhbmdlc01ldGhvZCh2aWV3KSksXG4gICAgbmV3IG8uQ2xhc3NNZXRob2QoJ2RpcnR5UGFyZW50UXVlcmllc0ludGVybmFsJywgW10sIHZpZXcuZGlydHlQYXJlbnRRdWVyaWVzTWV0aG9kLmZpbmlzaCgpKSxcbiAgICBuZXcgby5DbGFzc01ldGhvZCgnZGVzdHJveUludGVybmFsJywgW10sIHZpZXcuZGVzdHJveU1ldGhvZC5maW5pc2goKSlcbiAgXS5jb25jYXQodmlldy5ldmVudEhhbmRsZXJNZXRob2RzKTtcbiAgdmFyIHN1cGVyQ2xhc3MgPSB2aWV3LmdlbkNvbmZpZy5nZW5EZWJ1Z0luZm8gPyBJZGVudGlmaWVycy5EZWJ1Z0FwcFZpZXcgOiBJZGVudGlmaWVycy5BcHBWaWV3O1xuICB2YXIgdmlld0NsYXNzID0gbmV3IG8uQ2xhc3NTdG10KHZpZXcuY2xhc3NOYW1lLCBvLmltcG9ydEV4cHIoc3VwZXJDbGFzcywgW2dldENvbnRleHRUeXBlKHZpZXcpXSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmlldy5maWVsZHMsIHZpZXcuZ2V0dGVycywgdmlld0NvbnN0cnVjdG9yLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZpZXdNZXRob2RzLmZpbHRlcigobWV0aG9kKSA9PiBtZXRob2QuYm9keS5sZW5ndGggPiAwKSk7XG4gIHJldHVybiB2aWV3Q2xhc3M7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVZpZXdGYWN0b3J5KHZpZXc6IENvbXBpbGVWaWV3LCB2aWV3Q2xhc3M6IG8uQ2xhc3NTdG10LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVuZGVyQ29tcFR5cGVWYXI6IG8uUmVhZFZhckV4cHIpOiBvLlN0YXRlbWVudCB7XG4gIHZhciB2aWV3RmFjdG9yeUFyZ3MgPSBbXG4gICAgbmV3IG8uRm5QYXJhbShWaWV3Q29uc3RydWN0b3JWYXJzLnZpZXdVdGlscy5uYW1lLCBvLmltcG9ydFR5cGUoSWRlbnRpZmllcnMuVmlld1V0aWxzKSksXG4gICAgbmV3IG8uRm5QYXJhbShWaWV3Q29uc3RydWN0b3JWYXJzLnBhcmVudEluamVjdG9yLm5hbWUsIG8uaW1wb3J0VHlwZShJZGVudGlmaWVycy5JbmplY3RvcikpLFxuICAgIG5ldyBvLkZuUGFyYW0oVmlld0NvbnN0cnVjdG9yVmFycy5kZWNsYXJhdGlvbkVsLm5hbWUsIG8uaW1wb3J0VHlwZShJZGVudGlmaWVycy5BcHBFbGVtZW50KSlcbiAgXTtcbiAgdmFyIGluaXRSZW5kZXJDb21wVHlwZVN0bXRzID0gW107XG4gIHZhciB0ZW1wbGF0ZVVybEluZm87XG4gIGlmICh2aWV3LmNvbXBvbmVudC50ZW1wbGF0ZS50ZW1wbGF0ZVVybCA9PSB2aWV3LmNvbXBvbmVudC50eXBlLm1vZHVsZVVybCkge1xuICAgIHRlbXBsYXRlVXJsSW5mbyA9XG4gICAgICAgIGAke3ZpZXcuY29tcG9uZW50LnR5cGUubW9kdWxlVXJsfSBjbGFzcyAke3ZpZXcuY29tcG9uZW50LnR5cGUubmFtZX0gLSBpbmxpbmUgdGVtcGxhdGVgO1xuICB9IGVsc2Uge1xuICAgIHRlbXBsYXRlVXJsSW5mbyA9IHZpZXcuY29tcG9uZW50LnRlbXBsYXRlLnRlbXBsYXRlVXJsO1xuICB9XG4gIGlmICh2aWV3LnZpZXdJbmRleCA9PT0gMCkge1xuICAgIGluaXRSZW5kZXJDb21wVHlwZVN0bXRzID0gW1xuICAgICAgbmV3IG8uSWZTdG10KHJlbmRlckNvbXBUeXBlVmFyLmlkZW50aWNhbChvLk5VTExfRVhQUiksXG4gICAgICAgICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgICAgICAgcmVuZGVyQ29tcFR5cGVWYXIuc2V0KFZpZXdDb25zdHJ1Y3RvclZhcnNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnZpZXdVdGlscy5jYWxsTWV0aG9kKCdjcmVhdGVSZW5kZXJDb21wb25lbnRUeXBlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgby5saXRlcmFsKHRlbXBsYXRlVXJsSW5mbyksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG8ubGl0ZXJhbCh2aWV3LmNvbXBvbmVudFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC50ZW1wbGF0ZS5uZ0NvbnRlbnRTZWxlY3RvcnMubGVuZ3RoKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgVmlld0VuY2Fwc3VsYXRpb25FbnVtXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAuZnJvbVZhbHVlKHZpZXcuY29tcG9uZW50LnRlbXBsYXRlLmVuY2Fwc3VsYXRpb24pLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2aWV3LnN0eWxlc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXSkpXG4gICAgICAgICAgICAgICAgICAgICAgICAgLnRvU3RtdCgpXG4gICAgICAgICAgICAgICAgICAgXSlcbiAgICBdO1xuICB9XG4gIHJldHVybiBvLmZuKHZpZXdGYWN0b3J5QXJncywgaW5pdFJlbmRlckNvbXBUeXBlU3RtdHMuY29uY2F0KFtcbiAgICAgICAgICAgIG5ldyBvLlJldHVyblN0YXRlbWVudChvLnZhcmlhYmxlKHZpZXdDbGFzcy5uYW1lKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAuaW5zdGFudGlhdGUodmlld0NsYXNzLmNvbnN0cnVjdG9yTWV0aG9kLnBhcmFtcy5tYXAoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAocGFyYW0pID0+IG8udmFyaWFibGUocGFyYW0ubmFtZSkpKSlcbiAgICAgICAgICBdKSxcbiAgICAgICAgICAgICAgby5pbXBvcnRUeXBlKElkZW50aWZpZXJzLkFwcFZpZXcsIFtnZXRDb250ZXh0VHlwZSh2aWV3KV0pKVxuICAgICAgLnRvRGVjbFN0bXQodmlldy52aWV3RmFjdG9yeS5uYW1lLCBbby5TdG10TW9kaWZpZXIuRmluYWxdKTtcbn1cblxuZnVuY3Rpb24gZ2VuZXJhdGVDcmVhdGVNZXRob2QodmlldzogQ29tcGlsZVZpZXcpOiBvLlN0YXRlbWVudFtdIHtcbiAgdmFyIHBhcmVudFJlbmRlck5vZGVFeHByOiBvLkV4cHJlc3Npb24gPSBvLk5VTExfRVhQUjtcbiAgdmFyIHBhcmVudFJlbmRlck5vZGVTdG10cyA9IFtdO1xuICBpZiAodmlldy52aWV3VHlwZSA9PT0gVmlld1R5cGUuQ09NUE9ORU5UKSB7XG4gICAgcGFyZW50UmVuZGVyTm9kZUV4cHIgPSBWaWV3UHJvcGVydGllcy5yZW5kZXJlci5jYWxsTWV0aG9kKFxuICAgICAgICAnY3JlYXRlVmlld1Jvb3QnLCBbby5USElTX0VYUFIucHJvcCgnZGVjbGFyYXRpb25BcHBFbGVtZW50JykucHJvcCgnbmF0aXZlRWxlbWVudCcpXSk7XG4gICAgcGFyZW50UmVuZGVyTm9kZVN0bXRzID0gW1xuICAgICAgcGFyZW50UmVuZGVyTm9kZVZhci5zZXQocGFyZW50UmVuZGVyTm9kZUV4cHIpXG4gICAgICAgICAgLnRvRGVjbFN0bXQoby5pbXBvcnRUeXBlKHZpZXcuZ2VuQ29uZmlnLnJlbmRlclR5cGVzLnJlbmRlck5vZGUpLCBbby5TdG10TW9kaWZpZXIuRmluYWxdKVxuICAgIF07XG4gIH1cbiAgdmFyIHJlc3VsdEV4cHI6IG8uRXhwcmVzc2lvbjtcbiAgaWYgKHZpZXcudmlld1R5cGUgPT09IFZpZXdUeXBlLkhPU1QpIHtcbiAgICByZXN1bHRFeHByID0gKDxDb21waWxlRWxlbWVudD52aWV3Lm5vZGVzWzBdKS5hcHBFbGVtZW50O1xuICB9IGVsc2Uge1xuICAgIHJlc3VsdEV4cHIgPSBvLk5VTExfRVhQUjtcbiAgfVxuICByZXR1cm4gcGFyZW50UmVuZGVyTm9kZVN0bXRzLmNvbmNhdCh2aWV3LmNyZWF0ZU1ldGhvZC5maW5pc2goKSlcbiAgICAgIC5jb25jYXQoW1xuICAgICAgICBvLlRISVNfRVhQUi5jYWxsTWV0aG9kKCdpbml0JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjcmVhdGVGbGF0QXJyYXkodmlldy5yb290Tm9kZXNPckFwcEVsZW1lbnRzKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG8ubGl0ZXJhbEFycih2aWV3Lm5vZGVzLm1hcChub2RlID0+IG5vZGUucmVuZGVyTm9kZSkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgby5saXRlcmFsQXJyKHZpZXcuZGlzcG9zYWJsZXMpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgby5saXRlcmFsQXJyKHZpZXcuc3Vic2NyaXB0aW9ucylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBdKVxuICAgICAgICAgICAgLnRvU3RtdCgpLFxuICAgICAgICBuZXcgby5SZXR1cm5TdGF0ZW1lbnQocmVzdWx0RXhwcilcbiAgICAgIF0pO1xufVxuXG5mdW5jdGlvbiBnZW5lcmF0ZURldGVjdENoYW5nZXNNZXRob2QodmlldzogQ29tcGlsZVZpZXcpOiBvLlN0YXRlbWVudFtdIHtcbiAgdmFyIHN0bXRzID0gW107XG4gIGlmICh2aWV3LmRldGVjdENoYW5nZXNJbklucHV0c01ldGhvZC5pc0VtcHR5KCkgJiYgdmlldy51cGRhdGVDb250ZW50UXVlcmllc01ldGhvZC5pc0VtcHR5KCkgJiZcbiAgICAgIHZpZXcuYWZ0ZXJDb250ZW50TGlmZWN5Y2xlQ2FsbGJhY2tzTWV0aG9kLmlzRW1wdHkoKSAmJlxuICAgICAgdmlldy5kZXRlY3RDaGFuZ2VzUmVuZGVyUHJvcGVydGllc01ldGhvZC5pc0VtcHR5KCkgJiZcbiAgICAgIHZpZXcudXBkYXRlVmlld1F1ZXJpZXNNZXRob2QuaXNFbXB0eSgpICYmIHZpZXcuYWZ0ZXJWaWV3TGlmZWN5Y2xlQ2FsbGJhY2tzTWV0aG9kLmlzRW1wdHkoKSkge1xuICAgIHJldHVybiBzdG10cztcbiAgfVxuICBMaXN0V3JhcHBlci5hZGRBbGwoc3RtdHMsIHZpZXcuZGV0ZWN0Q2hhbmdlc0luSW5wdXRzTWV0aG9kLmZpbmlzaCgpKTtcbiAgc3RtdHMucHVzaChcbiAgICAgIG8uVEhJU19FWFBSLmNhbGxNZXRob2QoJ2RldGVjdENvbnRlbnRDaGlsZHJlbkNoYW5nZXMnLCBbRGV0ZWN0Q2hhbmdlc1ZhcnMudGhyb3dPbkNoYW5nZV0pXG4gICAgICAgICAgLnRvU3RtdCgpKTtcbiAgdmFyIGFmdGVyQ29udGVudFN0bXRzID0gdmlldy51cGRhdGVDb250ZW50UXVlcmllc01ldGhvZC5maW5pc2goKS5jb25jYXQoXG4gICAgICB2aWV3LmFmdGVyQ29udGVudExpZmVjeWNsZUNhbGxiYWNrc01ldGhvZC5maW5pc2goKSk7XG4gIGlmIChhZnRlckNvbnRlbnRTdG10cy5sZW5ndGggPiAwKSB7XG4gICAgc3RtdHMucHVzaChuZXcgby5JZlN0bXQoby5ub3QoRGV0ZWN0Q2hhbmdlc1ZhcnMudGhyb3dPbkNoYW5nZSksIGFmdGVyQ29udGVudFN0bXRzKSk7XG4gIH1cbiAgTGlzdFdyYXBwZXIuYWRkQWxsKHN0bXRzLCB2aWV3LmRldGVjdENoYW5nZXNSZW5kZXJQcm9wZXJ0aWVzTWV0aG9kLmZpbmlzaCgpKTtcbiAgc3RtdHMucHVzaChvLlRISVNfRVhQUi5jYWxsTWV0aG9kKCdkZXRlY3RWaWV3Q2hpbGRyZW5DaGFuZ2VzJywgW0RldGVjdENoYW5nZXNWYXJzLnRocm93T25DaGFuZ2VdKVxuICAgICAgICAgICAgICAgICAudG9TdG10KCkpO1xuICB2YXIgYWZ0ZXJWaWV3U3RtdHMgPVxuICAgICAgdmlldy51cGRhdGVWaWV3UXVlcmllc01ldGhvZC5maW5pc2goKS5jb25jYXQodmlldy5hZnRlclZpZXdMaWZlY3ljbGVDYWxsYmFja3NNZXRob2QuZmluaXNoKCkpO1xuICBpZiAoYWZ0ZXJWaWV3U3RtdHMubGVuZ3RoID4gMCkge1xuICAgIHN0bXRzLnB1c2gobmV3IG8uSWZTdG10KG8ubm90KERldGVjdENoYW5nZXNWYXJzLnRocm93T25DaGFuZ2UpLCBhZnRlclZpZXdTdG10cykpO1xuICB9XG5cbiAgdmFyIHZhclN0bXRzID0gW107XG4gIHZhciByZWFkVmFycyA9IG8uZmluZFJlYWRWYXJOYW1lcyhzdG10cyk7XG4gIGlmIChTZXRXcmFwcGVyLmhhcyhyZWFkVmFycywgRGV0ZWN0Q2hhbmdlc1ZhcnMuY2hhbmdlZC5uYW1lKSkge1xuICAgIHZhclN0bXRzLnB1c2goRGV0ZWN0Q2hhbmdlc1ZhcnMuY2hhbmdlZC5zZXQoby5saXRlcmFsKHRydWUpKS50b0RlY2xTdG10KG8uQk9PTF9UWVBFKSk7XG4gIH1cbiAgaWYgKFNldFdyYXBwZXIuaGFzKHJlYWRWYXJzLCBEZXRlY3RDaGFuZ2VzVmFycy5jaGFuZ2VzLm5hbWUpKSB7XG4gICAgdmFyU3RtdHMucHVzaChEZXRlY3RDaGFuZ2VzVmFycy5jaGFuZ2VzLnNldChvLk5VTExfRVhQUilcbiAgICAgICAgICAgICAgICAgICAgICAudG9EZWNsU3RtdChuZXcgby5NYXBUeXBlKG8uaW1wb3J0VHlwZShJZGVudGlmaWVycy5TaW1wbGVDaGFuZ2UpKSkpO1xuICB9XG4gIGlmIChTZXRXcmFwcGVyLmhhcyhyZWFkVmFycywgRGV0ZWN0Q2hhbmdlc1ZhcnMudmFsVW53cmFwcGVyLm5hbWUpKSB7XG4gICAgdmFyU3RtdHMucHVzaChcbiAgICAgICAgRGV0ZWN0Q2hhbmdlc1ZhcnMudmFsVW53cmFwcGVyLnNldChvLmltcG9ydEV4cHIoSWRlbnRpZmllcnMuVmFsdWVVbndyYXBwZXIpLmluc3RhbnRpYXRlKFtdKSlcbiAgICAgICAgICAgIC50b0RlY2xTdG10KG51bGwsIFtvLlN0bXRNb2RpZmllci5GaW5hbF0pKTtcbiAgfVxuICByZXR1cm4gdmFyU3RtdHMuY29uY2F0KHN0bXRzKTtcbn1cblxuZnVuY3Rpb24gYWRkUmV0dXJuVmFsdWVmTm90RW1wdHkoc3RhdGVtZW50czogby5TdGF0ZW1lbnRbXSwgdmFsdWU6IG8uRXhwcmVzc2lvbik6IG8uU3RhdGVtZW50W10ge1xuICBpZiAoc3RhdGVtZW50cy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIHN0YXRlbWVudHMuY29uY2F0KFtuZXcgby5SZXR1cm5TdGF0ZW1lbnQodmFsdWUpXSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHN0YXRlbWVudHM7XG4gIH1cbn1cblxuZnVuY3Rpb24gZ2V0Q29udGV4dFR5cGUodmlldzogQ29tcGlsZVZpZXcpOiBvLlR5cGUge1xuICB2YXIgdHlwZU1ldGEgPSB2aWV3LmNvbXBvbmVudC50eXBlO1xuICByZXR1cm4gdHlwZU1ldGEuaXNIb3N0ID8gby5EWU5BTUlDX1RZUEUgOiBvLmltcG9ydFR5cGUodHlwZU1ldGEpO1xufVxuXG5mdW5jdGlvbiBnZXRDaGFuZ2VEZXRlY3Rpb25Nb2RlKHZpZXc6IENvbXBpbGVWaWV3KTogQ2hhbmdlRGV0ZWN0aW9uU3RyYXRlZ3kge1xuICB2YXIgbW9kZTogQ2hhbmdlRGV0ZWN0aW9uU3RyYXRlZ3k7XG4gIGlmICh2aWV3LnZpZXdUeXBlID09PSBWaWV3VHlwZS5DT01QT05FTlQpIHtcbiAgICBtb2RlID0gaXNEZWZhdWx0Q2hhbmdlRGV0ZWN0aW9uU3RyYXRlZ3kodmlldy5jb21wb25lbnQuY2hhbmdlRGV0ZWN0aW9uKSA/XG4gICAgICAgICAgICAgICBDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneS5DaGVja0Fsd2F5cyA6XG4gICAgICAgICAgICAgICBDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneS5DaGVja09uY2U7XG4gIH0gZWxzZSB7XG4gICAgbW9kZSA9IENoYW5nZURldGVjdGlvblN0cmF0ZWd5LkNoZWNrQWx3YXlzO1xuICB9XG4gIHJldHVybiBtb2RlO1xufVxuIl19
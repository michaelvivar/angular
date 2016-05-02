import { isPresent, isBlank } from 'angular2/src/facade/lang';
import { ListWrapper } from 'angular2/src/facade/collection';
import * as o from '../output/output_ast';
import { Identifiers } from '../identifiers';
import { getPropertyInView } from './util';
class ViewQueryValues {
    constructor(view, values) {
        this.view = view;
        this.values = values;
    }
}
export class CompileQuery {
    constructor(meta, queryList, ownerDirectiveExpression, view) {
        this.meta = meta;
        this.queryList = queryList;
        this.ownerDirectiveExpression = ownerDirectiveExpression;
        this.view = view;
        this._values = new ViewQueryValues(view, []);
    }
    addValue(value, view) {
        var currentView = view;
        var elPath = [];
        while (isPresent(currentView) && currentView !== this.view) {
            var parentEl = currentView.declarationElement;
            elPath.unshift(parentEl);
            currentView = parentEl.view;
        }
        var queryListForDirtyExpr = getPropertyInView(this.queryList, view, this.view);
        var viewValues = this._values;
        elPath.forEach((el) => {
            var last = viewValues.values.length > 0 ? viewValues.values[viewValues.values.length - 1] : null;
            if (last instanceof ViewQueryValues && last.view === el.embeddedView) {
                viewValues = last;
            }
            else {
                var newViewValues = new ViewQueryValues(el.embeddedView, []);
                viewValues.values.push(newViewValues);
                viewValues = newViewValues;
            }
        });
        viewValues.values.push(value);
        if (elPath.length > 0) {
            view.dirtyParentQueriesMethod.addStmt(queryListForDirtyExpr.callMethod('setDirty', []).toStmt());
        }
    }
    afterChildren(targetMethod) {
        var values = createQueryValues(this._values);
        var updateStmts = [this.queryList.callMethod('reset', [o.literalArr(values)]).toStmt()];
        if (isPresent(this.ownerDirectiveExpression)) {
            var valueExpr = this.meta.first ? this.queryList.prop('first') : this.queryList;
            updateStmts.push(this.ownerDirectiveExpression.prop(this.meta.propertyName).set(valueExpr).toStmt());
        }
        if (!this.meta.first) {
            updateStmts.push(this.queryList.callMethod('notifyOnChanges', []).toStmt());
        }
        targetMethod.addStmt(new o.IfStmt(this.queryList.prop('dirty'), updateStmts));
    }
}
function createQueryValues(viewValues) {
    return ListWrapper.flatten(viewValues.values.map((entry) => {
        if (entry instanceof ViewQueryValues) {
            return mapNestedViews(entry.view.declarationElement.appElement, entry.view, createQueryValues(entry));
        }
        else {
            return entry;
        }
    }));
}
function mapNestedViews(declarationAppElement, view, expressions) {
    var adjustedExpressions = expressions.map((expr) => {
        return o.replaceVarInExpression(o.THIS_EXPR.name, o.variable('nestedView'), expr);
    });
    return declarationAppElement.callMethod('mapNestedViews', [
        o.variable(view.className),
        o.fn([new o.FnParam('nestedView', view.classType)], [new o.ReturnStatement(o.literalArr(adjustedExpressions))])
    ]);
}
export function createQueryList(query, directiveInstance, propertyName, compileView) {
    compileView.fields.push(new o.ClassField(propertyName, o.importType(Identifiers.QueryList)));
    var expr = o.THIS_EXPR.prop(propertyName);
    compileView.createMethod.addStmt(o.THIS_EXPR.prop(propertyName)
        .set(o.importExpr(Identifiers.QueryList).instantiate([]))
        .toStmt());
    return expr;
}
export function addQueryToTokenMap(map, query) {
    query.meta.selectors.forEach((selector) => {
        var entry = map.get(selector);
        if (isBlank(entry)) {
            entry = [];
            map.add(selector, entry);
        }
        entry.push(query);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcGlsZV9xdWVyeS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImRpZmZpbmdfcGx1Z2luX3dyYXBwZXItb3V0cHV0X3BhdGgtYVJYU3o0RlQudG1wL2FuZ3VsYXIyL3NyYy9jb21waWxlci92aWV3X2NvbXBpbGVyL2NvbXBpbGVfcXVlcnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ik9BQU8sRUFBQyxTQUFTLEVBQUUsT0FBTyxFQUFDLE1BQU0sMEJBQTBCO09BQ3BELEVBQUMsV0FBVyxFQUFDLE1BQU0sZ0NBQWdDO09BRW5ELEtBQUssQ0FBQyxNQUFNLHNCQUFzQjtPQUNsQyxFQUFDLFdBQVcsRUFBQyxNQUFNLGdCQUFnQjtPQVduQyxFQUFDLGlCQUFpQixFQUFDLE1BQU0sUUFBUTtBQUV4QztJQUNFLFlBQW1CLElBQWlCLEVBQVMsTUFBNkM7UUFBdkUsU0FBSSxHQUFKLElBQUksQ0FBYTtRQUFTLFdBQU0sR0FBTixNQUFNLENBQXVDO0lBQUcsQ0FBQztBQUNoRyxDQUFDO0FBRUQ7SUFHRSxZQUFtQixJQUEwQixFQUFTLFNBQXVCLEVBQzFELHdCQUFzQyxFQUFTLElBQWlCO1FBRGhFLFNBQUksR0FBSixJQUFJLENBQXNCO1FBQVMsY0FBUyxHQUFULFNBQVMsQ0FBYztRQUMxRCw2QkFBd0IsR0FBeEIsd0JBQXdCLENBQWM7UUFBUyxTQUFJLEdBQUosSUFBSSxDQUFhO1FBQ2pGLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxlQUFlLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQy9DLENBQUM7SUFFRCxRQUFRLENBQUMsS0FBbUIsRUFBRSxJQUFpQjtRQUM3QyxJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUM7UUFDdkIsSUFBSSxNQUFNLEdBQXFCLEVBQUUsQ0FBQztRQUNsQyxPQUFPLFNBQVMsQ0FBQyxXQUFXLENBQUMsSUFBSSxXQUFXLEtBQUssSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQzNELElBQUksUUFBUSxHQUFHLFdB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LCBpc0JsYW5rfSBmcm9tICdhbmd1bGFyMi9zcmMvZmFjYWRlL2xhbmcnO1xuaW1wb3J0IHtMaXN0V3JhcHBlcn0gZnJvbSAnYW5ndWxhcjIvc3JjL2ZhY2FkZS9jb2xsZWN0aW9uJztcblxuaW1wb3J0ICogYXMgbyBmcm9tICcuLi9vdXRwdXQvb3V0cHV0X2FzdCc7XG5pbXBvcnQge0lkZW50aWZpZXJzfSBmcm9tICcuLi9pZGVudGlmaWVycyc7XG5cbmltcG9ydCB7XG4gIENvbXBpbGVRdWVyeU1ldGFkYXRhLFxuICBDb21waWxlSWRlbnRpZmllck1ldGFkYXRhLFxuICBDb21waWxlVG9rZW5NYXBcbn0gZnJvbSAnLi4vY29tcGlsZV9tZXRhZGF0YSc7XG5cbmltcG9ydCB7Q29tcGlsZVZpZXd9IGZyb20gJy4vY29tcGlsZV92aWV3JztcbmltcG9ydCB7Q29tcGlsZUVsZW1lbnR9IGZyb20gJy4vY29tcGlsZV9lbGVtZW50JztcbmltcG9ydCB7Q29tcGlsZU1ldGhvZH0gZnJvbSAnLi9jb21waWxlX21ldGhvZCc7XG5pbXBvcnQge2dldFByb3BlcnR5SW5WaWV3fSBmcm9tICcuL3V0aWwnO1xuXG5jbGFzcyBWaWV3UXVlcnlWYWx1ZXMge1xuICBjb25zdHJ1Y3RvcihwdWJsaWMgdmlldzogQ29tcGlsZVZpZXcsIHB1YmxpYyB2YWx1ZXM6IEFycmF5PG8uRXhwcmVzc2lvbiB8IFZpZXdRdWVyeVZhbHVlcz4pIHt9XG59XG5cbmV4cG9ydCBjbGFzcyBDb21waWxlUXVlcnkge1xuICBwcml2YXRlIF92YWx1ZXM6IFZpZXdRdWVyeVZhbHVlcztcblxuICBjb25zdHJ1Y3RvcihwdWJsaWMgbWV0YTogQ29tcGlsZVF1ZXJ5TWV0YWRhdGEsIHB1YmxpYyBxdWVyeUxpc3Q6IG8uRXhwcmVzc2lvbixcbiAgICAgICAgICAgICAgcHVibGljIG93bmVyRGlyZWN0aXZlRXhwcmVzc2lvbjogby5FeHByZXNzaW9uLCBwdWJsaWMgdmlldzogQ29tcGlsZVZpZXcpIHtcbiAgICB0aGlzLl92YWx1ZXMgPSBuZXcgVmlld1F1ZXJ5VmFsdWVzKHZpZXcsIFtdKTtcbiAgfVxuXG4gIGFkZFZhbHVlKHZhbHVlOiBvLkV4cHJlc3Npb24sIHZpZXc6IENvbXBpbGVWaWV3KSB7XG4gICAgdmFyIGN1cnJlbnRWaWV3ID0gdmlldztcbiAgICB2YXIgZWxQYXRoOiBDb21waWxlRWxlbWVudFtdID0gW107XG4gICAgd2hpbGUgKGlzUHJlc2VudChjdXJyZW50VmlldykgJiYgY3VycmVudFZpZXcgIT09IHRoaXMudmlldykge1xuICAgICAgdmFyIHBhcmVudEVsID0gY3VycmVudFZpZXcuZGVjbGFyYXRpb25FbGVtZW50O1xuICAgICAgZWxQYXRoLnVuc2hpZnQocGFyZW50RWwpO1xuICAgICAgY3VycmVudFZpZXcgPSBwYXJlbnRFbC52aWV3O1xuICAgIH1cbiAgICB2YXIgcXVlcnlMaXN0Rm9yRGlydHlFeHByID0gZ2V0UHJvcGVydHlJblZpZXcodGhpcy5xdWVyeUxpc3QsIHZpZXcsIHRoaXMudmlldyk7XG5cbiAgICB2YXIgdmlld1ZhbHVlcyA9IHRoaXMuX3ZhbHVlcztcbiAgICBlbFBhdGguZm9yRWFjaCgoZWwpID0+IHtcbiAgICAgIHZhciBsYXN0ID1cbiAgICAgICAgICB2aWV3VmFsdWVzLnZhbHVlcy5sZW5ndGggPiAwID8gdmlld1ZhbHVlcy52YWx1ZXNbdmlld1ZhbHVlcy52YWx1ZXMubGVuZ3RoIC0gMV0gOiBudWxsO1xuICAgICAgaWYgKGxhc3QgaW5zdGFuY2VvZiBWaWV3UXVlcnlWYWx1ZXMgJiYgbGFzdC52aWV3ID09PSBlbC5lbWJlZGRlZFZpZXcpIHtcbiAgICAgICAgdmlld1ZhbHVlcyA9IGxhc3Q7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgbmV3Vmlld1ZhbHVlcyA9IG5ldyBWaWV3UXVlcnlWYWx1ZXMoZWwuZW1iZWRkZWRWaWV3LCBbXSk7XG4gICAgICAgIHZpZXdWYWx1ZXMudmFsdWVzLnB1c2gobmV3Vmlld1ZhbHVlcyk7XG4gICAgICAgIHZpZXdWYWx1ZXMgPSBuZXdWaWV3VmFsdWVzO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHZpZXdWYWx1ZXMudmFsdWVzLnB1c2godmFsdWUpO1xuXG4gICAgaWYgKGVsUGF0aC5sZW5ndGggPiAwKSB7XG4gICAgICB2aWV3LmRpcnR5UGFyZW50UXVlcmllc01ldGhvZC5hZGRTdG10KFxuICAgICAgICAgIHF1ZXJ5TGlzdEZvckRpcnR5RXhwci5jYWxsTWV0aG9kKCdzZXREaXJ0eScsIFtdKS50b1N0bXQoKSk7XG4gICAgfVxuICB9XG5cbiAgYWZ0ZXJDaGlsZHJlbih0YXJnZXRNZXRob2Q6IENvbXBpbGVNZXRob2QpIHtcbiAgICB2YXIgdmFsdWVzID0gY3JlYXRlUXVlcnlWYWx1ZXModGhpcy5fdmFsdWVzKTtcbiAgICB2YXIgdXBkYXRlU3RtdHMgPSBbdGhpcy5xdWVyeUxpc3QuY2FsbE1ldGhvZCgncmVzZXQnLCBbby5saXRlcmFsQXJyKHZhbHVlcyldKS50b1N0bXQoKV07XG4gICAgaWYgKGlzUHJlc2VudCh0aGlzLm93bmVyRGlyZWN0aXZlRXhwcmVzc2lvbikpIHtcbiAgICAgIHZhciB2YWx1ZUV4cHIgPSB0aGlzLm1ldGEuZmlyc3QgPyB0aGlzLnF1ZXJ5TGlzdC5wcm9wKCdmaXJzdCcpIDogdGhpcy5xdWVyeUxpc3Q7XG4gICAgICB1cGRhdGVTdG10cy5wdXNoKFxuICAgICAgICAgIHRoaXMub3duZXJEaXJlY3RpdmVFeHByZXNzaW9uLnByb3AodGhpcy5tZXRhLnByb3BlcnR5TmFtZSkuc2V0KHZhbHVlRXhwcikudG9TdG10KCkpO1xuICAgIH1cbiAgICBpZiAoIXRoaXMubWV0YS5maXJzdCkge1xuICAgICAgdXBkYXRlU3RtdHMucHVzaCh0aGlzLnF1ZXJ5TGlzdC5jYWxsTWV0aG9kKCdub3RpZnlPbkNoYW5nZXMnLCBbXSkudG9TdG10KCkpO1xuICAgIH1cbiAgICB0YXJnZXRNZXRob2QuYWRkU3RtdChuZXcgby5JZlN0bXQodGhpcy5xdWVyeUxpc3QucHJvcCgnZGlydHknKSwgdXBkYXRlU3RtdHMpKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBjcmVhdGVRdWVyeVZhbHVlcyh2aWV3VmFsdWVzOiBWaWV3UXVlcnlWYWx1ZXMpOiBvLkV4cHJlc3Npb25bXSB7XG4gIHJldHVybiBMaXN0V3JhcHBlci5mbGF0dGVuKHZpZXdWYWx1ZXMudmFsdWVzLm1hcCgoZW50cnkpID0+IHtcbiAgICBpZiAoZW50cnkgaW5zdGFuY2VvZiBWaWV3UXVlcnlWYWx1ZXMpIHtcbiAgICAgIHJldHVybiBtYXBOZXN0ZWRWaWV3cyhlbnRyeS52aWV3LmRlY2xhcmF0aW9uRWxlbWVudC5hcHBFbGVtZW50LCBlbnRyeS52aWV3LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNyZWF0ZVF1ZXJ5VmFsdWVzKGVudHJ5KSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiA8by5FeHByZXNzaW9uPmVudHJ5O1xuICAgIH1cbiAgfSkpO1xufVxuXG5mdW5jdGlvbiBtYXBOZXN0ZWRWaWV3cyhkZWNsYXJhdGlvbkFwcEVsZW1lbnQ6IG8uRXhwcmVzc2lvbiwgdmlldzogQ29tcGlsZVZpZXcsXG4gICAgICAgICAgICAgICAgICAgICAgICBleHByZXNzaW9uczogby5FeHByZXNzaW9uW10pOiBvLkV4cHJlc3Npb24ge1xuICB2YXIgYWRqdXN0ZWRFeHByZXNzaW9uczogby5FeHByZXNzaW9uW10gPSBleHByZXNzaW9ucy5tYXAoKGV4cHIpID0+IHtcbiAgICByZXR1cm4gby5yZXBsYWNlVmFySW5FeHByZXNzaW9uKG8uVEhJU19FWFBSLm5hbWUsIG8udmFyaWFibGUoJ25lc3RlZFZpZXcnKSwgZXhwcik7XG4gIH0pO1xuICByZXR1cm4gZGVjbGFyYXRpb25BcHBFbGVtZW50LmNhbGxNZXRob2QoJ21hcE5lc3RlZFZpZXdzJywgW1xuICAgIG8udmFyaWFibGUodmlldy5jbGFzc05hbWUpLFxuICAgIG8uZm4oW25ldyBvLkZuUGFyYW0oJ25lc3RlZFZpZXcnLCB2aWV3LmNsYXNzVHlwZSldLFxuICAgICAgICAgW25ldyBvLlJldHVyblN0YXRlbWVudChvLmxpdGVyYWxBcnIoYWRqdXN0ZWRFeHByZXNzaW9ucykpXSlcbiAgXSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVRdWVyeUxpc3QocXVlcnk6IENvbXBpbGVRdWVyeU1ldGFkYXRhLCBkaXJlY3RpdmVJbnN0YW5jZTogby5FeHByZXNzaW9uLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eU5hbWU6IHN0cmluZywgY29tcGlsZVZpZXc6IENvbXBpbGVWaWV3KTogby5FeHByZXNzaW9uIHtcbiAgY29tcGlsZVZpZXcuZmllbGRzLnB1c2gobmV3IG8uQ2xhc3NGaWVsZChwcm9wZXJ0eU5hbWUsIG8uaW1wb3J0VHlwZShJZGVudGlmaWVycy5RdWVyeUxpc3QpKSk7XG4gIHZhciBleHByID0gby5USElTX0VYUFIucHJvcChwcm9wZXJ0eU5hbWUpO1xuICBjb21waWxlVmlldy5jcmVhdGVNZXRob2QuYWRkU3RtdChvLlRISVNfRVhQUi5wcm9wKHByb3BlcnR5TmFtZSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5zZXQoby5pbXBvcnRFeHByKElkZW50aWZpZXJzLlF1ZXJ5TGlzdCkuaW5zdGFudGlhdGUoW10pKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnRvU3RtdCgpKTtcbiAgcmV0dXJuIGV4cHI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRRdWVyeVRvVG9rZW5NYXAobWFwOiBDb21waWxlVG9rZW5NYXA8Q29tcGlsZVF1ZXJ5W10+LCBxdWVyeTogQ29tcGlsZVF1ZXJ5KSB7XG4gIHF1ZXJ5Lm1ldGEuc2VsZWN0b3JzLmZvckVhY2goKHNlbGVjdG9yKSA9PiB7XG4gICAgdmFyIGVudHJ5ID0gbWFwLmdldChzZWxlY3Rvcik7XG4gICAgaWYgKGlzQmxhbmsoZW50cnkpKSB7XG4gICAgICBlbnRyeSA9IFtdO1xuICAgICAgbWFwLmFkZChzZWxlY3RvciwgZW50cnkpO1xuICAgIH1cbiAgICBlbnRyeS5wdXNoKHF1ZXJ5KTtcbiAgfSk7XG59XG4iXX0=
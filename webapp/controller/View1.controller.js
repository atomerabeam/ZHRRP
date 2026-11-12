sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap/m/Token",
    "sap/m/Label",
    "sap/m/Text",
    "sap/m/SearchField",
    "sap/m/SelectDialog",
    "sap/m/StandardListItem",
    "sap/m/Column",
    "sap/m/ColumnListItem",
    "sap/ui/table/Column",
    "sap/ui/comp/valuehelpdialog/ValueHelpDialog",
    "sap/ui/comp/filterbar/FilterBar",
    "sap/ui/export/Spreadsheet",
    "sap/ui/export/library",
    "hrrpproject1/model/formatter"
], (Controller, JSONModel, Filter, FilterOperator, MessageBox, Token, Label, Text, SearchField, SelectDialog,
    StandardListItem, MColumn, ColumnListItem, UiColumn, ValueHelpDialog, FilterBar, Spreadsheet, exportLibrary,
    formatter) => {
    "use strict";

    const EdmType = exportLibrary.EdmType;

    /** Report entity set (PNL_Entity) */
    const ENTITY_SET = "/PNL_EntitySet";

    /**
     * Selection screen fields, keyed by the PNL_Entity property they filter on (= the control's "name").
     * vhSet / vhKey / vhText describe the search help entity set; the search help is skipped
     * (range fields: conditions only) while the entity set isn't in the service.
     * values builds a local search help list for fields without an entity set.
     */
    const SELECTION = {
        Bukrs: { control: "inpCompanyCode", label: "fldCompanyCode", required: true, upperCase: true,
            vhSet: "CompanyCodeVHSet", vhKey: "Bukrs", vhText: "Butxt" },
        Gjahr: { control: "inpFiscalYear", label: "fldFiscalYear", required: true, vhKey: "key",
            values: () => Array.from({ length: 6 }, (_, i) => ({ key: String(new Date().getFullYear() - i) })) },
        Poper: { control: "inpPeriod", label: "fldPeriod", required: true, vhKey: "key",
            values: () => Array.from({ length: 12 }, (_, i) => ({ key: String(i + 1).padStart(2, "0") })) },
        NodeId: { control: "inpNodeId", label: "fldNodeId", required: true, upperCase: true,
            vhSet: "Node_ID_VHSet", vhKey: "Hryid", vhText: "Hrytxt" },
        Prctr: { control: "miProfitCenter", label: "fldProfitCenter", multi: true,
            vhSet: "ProfitCenterVHSet", vhKey: "Prctr", vhText: "Ktext" },
        Kostl: { control: "miCostCenter", label: "fldCostCenter", multi: true,
            vhSet: "CostCenterVHSet", vhKey: "Kostl", vhText: "Ktext" },
        Segment: { control: "miSegment", label: "fldSegment", multi: true,
            vhSet: "SegmentVHSet", vhKey: "Segment", vhText: "Name" },
        Werks: { control: "miPlant", label: "fldPlant", multi: true,
            vhSet: "PlantVHSet", vhKey: "Werks", vhText: "Name1" }
    };

    /** Report columns in display order; the first one is the tree column */
    const COLUMNS = [
        { key: "Hrynode", label: "colHierarchyNode", width: "16rem" },
        { key: "Bukrs", label: "colCompanyCode", width: "7rem" },
        { key: "Saknr", label: "colGlAccount", width: "9rem", formatter: formatter.glAccount },
        { key: "Txt50", label: "colGlDescription", width: "14rem" },
        { key: "FuncArea", label: "colFunctionalArea", width: "8rem" },
        { key: "CurMonth", label: "colCurrentMonth", amount: true },
        { key: "BudMonth", label: "colBudgetMonth", amount: true },
        { key: "VarBudMonth", label: "colVarBudgetMonth", amount: true },
        { key: "PrevMonth", label: "colPreviousMonth", amount: true },
        { key: "VarPrevMonth", label: "colVarPreviousMonth", amount: true },
        { key: "LyMonth", label: "colLastYearCurrentMonth", amount: true },
        { key: "VarLyMonth", label: "colVarLastYearCurrentMonth", amount: true },
        { key: "Ytd", label: "colCurrentYtd", amount: true },
        { key: "BudYtd", label: "colBudgetYtd", amount: true },
        { key: "VarBudYtd", label: "colVarBudgetYtd", amount: true },
        { key: "PyYtd", label: "colPreviousYearYtd", amount: true },
        { key: "VarPyYtd", label: "colVarPreviousYearYtd", amount: true },
        { key: "BudFy", label: "colCurrentYearBudgetYtd", amount: true }
    ];

    /** Value help range operations -> OData operator when the range is an exclusion */
    const EXCLUDE_OPERATOR = {
        EQ: FilterOperator.NE,
        NE: FilterOperator.EQ,
        BT: FilterOperator.NB,
        LT: FilterOperator.GE,
        LE: FilterOperator.GT,
        GT: FilterOperator.LE,
        GE: FilterOperator.LT,
        Contains: FilterOperator.NotContains,
        StartsWith: FilterOperator.NotStartsWith,
        EndsWith: FilterOperator.NotEndsWith
    };

    return Controller.extend("hrrpproject1.controller.View1", {
        onInit() {
            this.getView().setModel(new JSONModel({
                rows: [],
                flat: [],
                count: 0,
                title: "",
                noData: this._text("msgNoData")
            }), "pnl");

            this._createColumns();

            // Search helps are only offered for value help entity sets the service has
            this._mVhSets = {};
            const oModel = this.getOwnerComponent().getModel();
            oModel.metadataLoaded().then(() => {
                const oMetaModel = oModel.getMetaModel();
                return oMetaModel.loaded().then(() => {
                    Object.values(SELECTION).filter((oField) => oField.vhSet).forEach((oField) => {
                        const bAvailable = !!oMetaModel.getODataEntitySet(oField.vhSet);
                        this._mVhSets[oField.vhSet] = bAvailable;
                        if (!oField.multi) {
                            this.byId(oField.control).setShowValueHelp(bAvailable);
                        }
                    });
                });
            });

            // Typed entries in the range fields become single-value tokens
            Object.values(SELECTION).filter((oField) => oField.multi).forEach((oField) => {
                this.byId(oField.control).addValidator(({ text }) => {
                    const sValue = text.trim().toUpperCase();
                    return sValue ? new Token({ key: sValue, text: sValue }) : null;
                });
            });
        },

        _text(sKey, aArgs) {
            return this.getOwnerComponent().getModel("i18n").getResourceBundle().getText(sKey, aArgs);
        },

        _createColumns() {
            const oTable = this.byId("treeTable");
            COLUMNS.forEach((oCol) => {
                oTable.addColumn(new UiColumn({
                    width: oCol.width || "10rem",
                    hAlign: oCol.amount ? "End" : "Begin",
                    label: new Label({ text: this._text(oCol.label), wrapping: true }),
                    template: new Text({
                        wrapping: false,
                        text: oCol.amount ? {
                            parts: ["pnl>" + oCol.key, "pnl>Waers"],
                            formatter: formatter.amount
                        } : {
                            path: "pnl>" + oCol.key,
                            formatter: oCol.formatter
                        }
                    })
                }));
            });
        },

        /* =========================================================== */
        /* Selection screen                                            */
        /* =========================================================== */

        onSearch() {
            const aFilters = this._getFilters();
            if (aFilters) {
                this._loadReport(aFilters);
            }
        },

        onClear() {
            Object.values(SELECTION).forEach((oField) => {
                const oControl = this.byId(oField.control);
                oControl.setValueState("None");
                if (oField.multi) {
                    oControl.removeAllTokens();
                }
                oControl.setValue("");
            });
            this._setResult([]);
            this.getView().getModel("pnl").setProperty("/noData", this._text("msgNoData"));
        },

        /**
         * Validates the selection screen and builds the OData filters.
         * @returns {sap.ui.model.Filter[]|null} filters, or null if the input is invalid
         */
        _getFilters() {
            const aFilters = [];
            let sError = "";

            Object.entries(SELECTION).forEach(([sProperty, oField]) => {
                const oControl = this.byId(oField.control);
                oControl.setValueState("None");

                if (oField.multi) {
                    const oFilter = this._getRangeFilter(sProperty, oControl.getTokens());
                    if (oFilter) {
                        aFilters.push(oFilter);
                    }
                    return;
                }

                let sValue = oControl.getValue().trim();
                if (oField.upperCase) {
                    sValue = sValue.toUpperCase();
                }

                let sFieldError = "";
                if (!sValue) {
                    sFieldError = oField.required ? this._text("msgRequired") : "";
                } else if (sProperty === "Gjahr" && !/^\d{4}$/.test(sValue)) {
                    sFieldError = this._text("msgFiscalYear");
                } else if (sProperty === "Poper") {
                    const iPeriod = /^\d{1,2}$/.test(sValue) ? Number(sValue) : 0;
                    if (iPeriod < 1 || iPeriod > 12) {
                        sFieldError = this._text("msgPeriod");
                    } else {
                        sValue = String(iPeriod).padStart(2, "0");
                    }
                }

                if (sFieldError) {
                    oControl.setValueState("Error");
                    oControl.setValueStateText(sFieldError);
                    sError = sError || sFieldError;
                } else if (sValue) {
                    aFilters.push(new Filter(sProperty, FilterOperator.EQ, sValue));
                }
            });

            if (sError) {
                MessageBox.error(sError);
                return null;
            }
            return aFilters;
        },

        /**
         * Builds the filter for one range field: included values/ranges are ORed,
         * excluded ones are ANDed onto them.
         * @param {string} sProperty PNL_Entity property
         * @param {sap.m.Token[]} aTokens tokens of the MultiInput
         * @returns {sap.ui.model.Filter|null} filter, or null if there are no tokens
         */
        _getRangeFilter(sProperty, aTokens) {
            const aInclude = [];
            const aExclude = [];

            aTokens.forEach((oToken) => {
                const oRange = oToken.data("range");
                if (!oRange) {
                    aInclude.push(new Filter(sProperty, FilterOperator.EQ, oToken.getKey()));
                    return;
                }

                const bEmpty = oRange.operation === "Empty" || oRange.operation === "Initial";
                const sOperation = bEmpty ? "EQ" : oRange.operation;
                const sOperator = oRange.exclude ? EXCLUDE_OPERATOR[sOperation] : FilterOperator[sOperation];
                if (!sOperator) {
                    return;
                }
                const oFilter = new Filter({
                    path: sProperty,
                    operator: sOperator,
                    value1: bEmpty ? "" : oRange.value1,
                    value2: oRange.value2
                });
                (oRange.exclude ? aExclude : aInclude).push(oFilter);
            });

            const aParts = aExclude.slice();
            if (aInclude.length) {
                aParts.unshift(new Filter({ filters: aInclude, and: false }));
            }
            if (!aParts.length) {
                return null;
            }
            return aParts.length === 1 ? aParts[0] : new Filter({ filters: aParts, and: true });
        },

        /* =========================================================== */
        /* Search helps                                                */
        /* =========================================================== */

        /** Search help for the single-value fields (Company Code, Fiscal Year, Period, Node ID) */
        onValueHelpSingle(oEvent) {
            const oInput = oEvent.getSource();
            const oField = SELECTION[oInput.getName()];

            const oDialog = new SelectDialog({
                title: this._text(oField.label),
                items: {
                    path: oField.values ? "/items" : "/" + oField.vhSet,
                    template: new StandardListItem({
                        title: "{" + oField.vhKey + "}",
                        description: oField.vhText ? "{" + oField.vhText + "}" : ""
                    })
                },
                search: (oSearchEvent) => {
                    oSearchEvent.getSource().getBinding("items")
                        .filter(this._getSearchFilters(oField, oSearchEvent.getParameter("value")));
                },
                confirm: (oConfirmEvent) => {
                    const oItem = oConfirmEvent.getParameter("selectedItem");
                    if (oItem) {
                        oInput.setValue(oItem.getTitle());
                        oInput.setValueState("None");
                    }
                    oDialog.destroy();
                },
                cancel: () => oDialog.destroy()
            });
            if (oField.values) {
                oDialog.setModel(new JSONModel({ items: oField.values() }));
            }
            this.getView().addDependent(oDialog);
            oDialog.open();
        },

        /** Search help with ranges and multiple selection (Profit Center, Cost Center, Segment, Plant) */
        onValueHelpRange(oEvent) {
            const oMultiInput = oEvent.getSource();
            const oField = SELECTION[oMultiInput.getName()];
            const sLabel = this._text(oField.label);
            const aProps = [[oField.vhKey, sLabel], [oField.vhText, this._text("vhDescription")]];
            const bHasList = !!this._mVhSets[oField.vhSet];

            const oDialog = new ValueHelpDialog({
                title: sLabel,
                key: oField.vhKey,
                descriptionKey: oField.vhText,
                supportMultiselect: true,
                supportRanges: true,
                supportRangesOnly: !bHasList,
                ok: (oOkEvent) => {
                    oMultiInput.setTokens(oOkEvent.getParameter("tokens"));
                    oDialog.close();
                },
                cancel: () => oDialog.close(),
                afterClose: () => oDialog.destroy()
            });
            oDialog.setRangeKeyFields([{ label: sLabel, key: oField.vhKey, type: "string" }]);
            oDialog.setTokens(oMultiInput.getTokens());
            this.getView().addDependent(oDialog);

            if (!bHasList) {
                oDialog.open();
                return;
            }

            const oSearchField = new SearchField({ showSearchButton: false });
            const fnSearch = () => {
                const oTable = oDialog.getTable();
                const oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
                oBinding.filter(this._getSearchFilters(oField, oSearchField.getValue()));
            };
            oSearchField.attachSearch(fnSearch);
            oDialog.setFilterBar(new FilterBar({
                advancedMode: true,
                basicSearch: oSearchField,
                search: fnSearch
            }));

            oDialog.getTableAsync().then((oTable) => {
                oTable.setModel(this.getOwnerComponent().getModel());
                const oBindingInfo = {
                    path: "/" + oField.vhSet,
                    events: { dataReceived: () => oDialog.update() }
                };

                if (oTable.bindRows) {
                    // sap.ui.table.Table (desktop)
                    aProps.forEach(([sPath, sText]) => {
                        oTable.addColumn(new UiColumn({
                            label: new Label({ text: sText }),
                            template: new Text({ text: "{" + sPath + "}", wrapping: false })
                        }));
                    });
                    oTable.bindRows(oBindingInfo);
                } else {
                    // sap.m.Table (phone)
                    aProps.forEach(([, sText]) => oTable.addColumn(new MColumn({ header: new Label({ text: sText }) })));
                    oBindingInfo.template = new ColumnListItem({
                        cells: aProps.map(([sPath]) => new Text({ text: "{" + sPath + "}" }))
                    });
                    oTable.bindItems(oBindingInfo);
                }
                oDialog.update();
            });

            oDialog.open();
        },

        _getSearchFilters(oField, sQuery) {
            const sValue = (sQuery || "").trim();
            if (!sValue) {
                return [];
            }
            const aFilters = [new Filter(oField.vhKey, FilterOperator.Contains, sValue.toUpperCase())];
            if (oField.vhText) {
                aFilters.push(new Filter(oField.vhText, FilterOperator.Contains, sValue));
            }
            return [new Filter({ filters: aFilters, and: false })];
        },

        /* =========================================================== */
        /* Report                                                      */
        /* =========================================================== */

        _loadReport(aFilters) {
            const oTable = this.byId("treeTable");
            oTable.setBusy(true);

            this.getOwnerComponent().getModel().read(ENTITY_SET, {
                filters: aFilters,
                success: (oData) => {
                    this._setResult(oData.results || []);
                    this.getView().getModel("pnl").setProperty("/noData", this._text("msgNoResults"));
                    oTable.setBusy(false);
                    this.byId("page").setHeaderExpanded(false);
                },
                error: (oError) => {
                    oTable.setBusy(false);
                    MessageBox.error(this._text("msgLoadError"), {
                        details: oError && oError.responseText
                    });
                }
            });
        },

        _setResult(aEntries) {
            const oModel = this.getView().getModel("pnl");
            const oTree = this._buildTree(aEntries);
            const iAccounts = oTree.flat.filter((oRow) => oRow.Saknr).length;
            oModel.setProperty("/rows", oTree.roots);
            oModel.setProperty("/flat", oTree.flat);
            oModel.setProperty("/count", oTree.flat.length);
            oModel.setProperty("/title", this._text("tableTitle", [iAccounts]));
            this.byId("treeTable").collapseAll();
            this.byId("treeTable").expandToLevel(1);
        },

        /**
         * Turns the flat PNL_Entity rows into nested nodes. The parent is the row with
         * NodeId = ParentNodeId; if that row doesn't exist or isn't one level up, the closest
         * preceding row one level up is used (rows come in hierarchy order).
         * @param {object[]} aEntries PNL_Entity rows
         * @returns {{roots: object[], flat: object[]}} root rows with children in "nodes", and all rows in order
         */
        _buildTree(aEntries) {
            const aRows = aEntries.map((oEntry) => Object.assign({}, oEntry, { nodes: [] }));
            const mById = new Map(aRows.map((oRow) => [oRow.NodeId, oRow]));
            const aLastAtLevel = [];
            const aRoots = [];

            aRows.forEach((oRow) => {
                const iLevel = oRow.HierarchyLevel;
                let oParent = mById.get(oRow.ParentNodeId);
                if (!oParent || oParent === oRow || oParent.HierarchyLevel !== iLevel - 1) {
                    oParent = aLastAtLevel[iLevel - 1];
                }
                (oParent ? oParent.nodes : aRoots).push(oRow);
                aLastAtLevel[iLevel] = oRow;
                aLastAtLevel.length = Math.max(iLevel + 1, 0);
            });
            return { roots: aRoots, flat: aRows };
        },

        onExpandAll: function () {
  var oTable = this.byId("treeTable");
  oTable.setBusy(true);
  oTable.expandToLevel(20);   // any number deeper than your FSV goes
  oTable.setBusy(false);
},

onCollapseAll: function () {
  this.byId("treeTable").collapseAll();
},

        onExport() {
            const oSheet = new Spreadsheet({
                workbook: {
                    columns: COLUMNS.map((oCol) => ({
                        label: this._text(oCol.label),
                        property: oCol.key,
                        type: oCol.amount ? EdmType.Currency : EdmType.String,
                        unitProperty: oCol.amount ? "Waers" : undefined,
                        displayUnit: false
                    }))
                },
                dataSource: this.getView().getModel("pnl").getProperty("/flat"),
                fileName: "PnL_Report.xlsx"
            });
            oSheet.build().finally(() => oSheet.destroy());
        }
    });
});

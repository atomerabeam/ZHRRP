sap.ui.define([
    "sap/ui/core/format/NumberFormat"
], function (NumberFormat) {
    "use strict";

    const oAmountFormat = NumberFormat.getCurrencyInstance({
        showMeasure: false
    });

    return {
        /**
         * Formats an amount with grouping and the currency's decimals, e.g. "-1,234.50" for EUR.
         * @param {number|string} vAmount amount (OData V2 decimals arrive as strings)
         * @param {string} sCurrency currency key (Waers)
         * @returns {string} formatted amount, empty if there is no value
         */
        amount: function (vAmount, sCurrency) {
            if (vAmount === null || vAmount === undefined || vAmount === "") {
                return "";
            }
            return oAmountFormat.format(Number(vAmount), sCurrency || undefined);
        },

        /**
         * Removes leading zeros from a GL account, e.g. "0071401010" -> "71401010".
         * @param {string} sAccount GL account number
         * @returns {string} account without leading zeros
         */
        glAccount: function (sAccount) {
            return (sAccount || "").trim().replace(/^0+(?=.)/, "");
        }
    };
});

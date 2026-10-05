import { createContext, useContext } from "react";


export const SheetRoleContext = createContext<"top" | "peek">("top");
export const useSheetRole = () => useContext(SheetRoleContext);

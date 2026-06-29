// 前端入口：挂载 React 应用并加载全局样式
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";

// 挂载根组件到 #root 节点
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

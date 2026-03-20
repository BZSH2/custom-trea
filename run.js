const API_A_URL =
  "http://mail.bzsh.asia/api/trae/reserve-mailbox?token=IBKBI_dLiC-2jYFEe8GJwbMsCghOr7e1";

/**
 * 请求 A 接口获取邮箱
 */
async function getEmailFromA() {
  console.log(`正在从 A 接口获取邮箱... (${API_A_URL})`);
  try {
    const response = await fetch(API_A_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (!data.email) {
      throw new Error("API A 响应中缺少 'email' 字段");
    }
    console.log(`获取到邮箱: ${data.email}`);
    return data.email;
  } catch (error) {
    console.error(`从 A 接口获取邮箱失败: ${error.message}`);
    console.log("将使用备用邮箱进行测试。");
    return `fallback-${Date.now()}@example.com`;
  }
}

const { runForm } = require("./form");

/**
 * 运行注册流程
 */
async function executeWorkflow(email) {
  console.log("正在启动注册流程...");
  try {
    const result = await runForm(email);
    // runForm 内部已经处理了日志打印
    return result;
  } catch (error) {
    console.error("注册流程执行失败:", error);
    return "失败";
  }
}

async function main() {
  try {
    // 1. 请求 A 接口获取邮箱
    const email = await getEmailFromA();

    // 2. 运行注册流程
    const finalResult = await executeWorkflow(email);

    if (finalResult !== "失败") {
      console.log(`\n✅ 运行成功！最终结果: ${email}`);
    } else {
      console.log(`\n❌ 运行失败！最终结果: 失败`);
    }

    console.log("所有流程已完成。");
  } catch (error) {
    console.error("主流程执行失败:", error);
    process.exit(1);
  }
}

main();

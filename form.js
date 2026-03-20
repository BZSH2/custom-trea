const { chromium } = require("playwright");

async function runForm(email) {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // 增加超时时间到 60 秒（或者直接设为 0 不限制超时），并改变等待策略
  // commit：只要收到服务器响应并开始加载文档，goto 就会结束等待，后续依靠 waitForSelector 来保证元素加载
  await page.goto("https://www.trae.ai/sign-up", {
    waitUntil: "commit",
    timeout: 60000,
  });

  // 强制等待一段时间（比如 3 秒），让 Trae 网站的前端路由跳转（如多语言重定向）、
  // 登录状态检查和页面重新渲染（React Hydration）彻底完成。
  // 这样能防止 Playwright 在即将被销毁的旧页面上填完值后，页面刷新导致内容丢失。
  await page.waitForTimeout(3000);

  // 等待最终稳定的页面中的元素出现并可见
  await page.waitForSelector('input[name="email"]', { state: "visible" });

  // 填充内容
  console.log(`Using email: ${email}`);
  await page.fill('input[name="email"]', email);

  // 【关键修复】：触发邮箱输入框的失焦（blur）事件或敲击回车。
  // 很多现代前端框架（如 React/Vue）在输入框失去焦点后，才会触发邮箱格式的校验，
  // 校验通过后，“发送验证码”按钮才会被真正激活（例如移除 pointer-events: none 样式）。
  await page.locator('input[name="email"]').blur();

  // 使用更现代的 locator 方式，并基于 class 查找
  const sendCodeBtn = page.locator(".right-part.send-code");

  // 等待元素可见
  await sendCodeBtn.waitFor({ state: "visible" });

  // 稍微延迟一下，等待前端状态更新（如按钮从灰色变成可点击的亮色）
  await page.waitForTimeout(500);

  // 点击“发送验证码”按钮并处理可能出现的错误提示
  let success = false;
  let attempts = 0;
  const maxAttempts = 3;

  while (!success && attempts < maxAttempts) {
    attempts++;
    console.log(`第 ${attempts} 次尝试点击发送验证码...`);

    // 强制点击（避免被遮挡或其他问题）
    await sendCodeBtn.click({ force: true });

    // 等待一小段时间看是否有错误提示出现
    // 假设错误提示是一个 toast 或者在输入框下方的错误信息（需根据实际页面结构调整选择器）
    // 常见的错误提示类名可能包含 error, toast, message 等
    try {
      // 错误提示是一个 toast 弹窗（使用 role="status" 或 aria-live="polite" 属性来精确定位）
      // 设置超时时间为 10 秒，等待报错出现
      const errorMsg = await page.waitForSelector(
        'div[role="status"][aria-live="polite"]',
        {
          state: "visible",
          timeout: 10000,
        },
      );
      if (errorMsg) {
        const text = await errorMsg.innerText();
        console.log(`出现错误提示: "${text}"，准备重试...`);

        // 由于邮箱被占用等错误是“死结”，简单的重复点击没有意义。
        // 你可以在这里加入重新生成邮箱并填写的逻辑，或者像现在这样等待它消失。
        await page.waitForTimeout(2000);
      }
    } catch (e) {
      // 如果 10 秒内没有找到错误提示，我们就假定点击成功了
      // 或者这里可以通过监听网络请求（/api/send-code 之类的）来判断是否真正成功
      console.log("没有检测到错误提示，假设验证码已发送。");
      success = true;
    }
  }

  if (!success) {
    console.log("达到最大重试次数，未能成功发送验证码。");
    return; // 退出
  }

  // --- 新增：轮询 B 接口获取验证码并回填到页面 ---
  const mailbox = email; // 直接使用完整邮箱地址
  const API_B_BASE_URL =
    "http://mail.bzsh.asia/api/mail/latest-code?token=IBKBI_dLiC-2jYFEe8GJwbMsCghOr7e1";
  const API_B_URL = `${API_B_BASE_URL}&mailbox=${encodeURIComponent(mailbox)}`;

  console.log(`开始轮询 B 接口获取验证码... (${API_B_URL})`);
  let attempts_poll = 0;
  const maxAttempts_poll = 30; // 增加到 30 次以应对更长的延迟
  const interval_poll = 5000;

  while (attempts_poll < maxAttempts_poll) {
    attempts_poll++;
    console.log(`第 ${attempts_poll} 次轮询验证码...`);

    try {
      // 等待 5 秒再请求
      await page.waitForTimeout(interval_poll);

      // 在浏览器环境中发起 fetch 请求（绕过某些 CORS 限制或直接使用 node fetch）
      const response = await fetch(API_B_URL);
      if (response.ok) {
        const data = await response.json();
        if (data.found && data.code) {
          console.log(`🎉 成功获取到验证码: ${data.code}`);

          // --- 关键步骤：将验证码回填到页面 ---
          // --- 关键步骤：将验证码回填到页面 ---
          // 匹配用户提供的 Verification code 控件
          const codeInputSelector =
            'input[placeholder="Verification code"], input[placeholder*="验证码"], input[name="code"]';
          await page.waitForSelector(codeInputSelector, {
            state: "visible",
            timeout: 5000,
          });
          await page.fill(codeInputSelector, data.code);
          console.log(`验证码 ${data.code} 已成功填入页面。`);

          // --- 新增：填写密码逻辑 ---
          const password = "123456wb.";
          const passwordSelector =
            'input[type="password"][placeholder="Password"]';
          console.log(`正在填写密码: ${password}`);
          await page.waitForSelector(passwordSelector, {
            state: "visible",
            timeout: 5000,
          });
          await page.fill(passwordSelector, password);
          console.log("密码已成功填入页面。");

          // --- 新增：点击注册按钮 ---
          // 使用用户提供的类名组合进行精准定位，并包含文本内容校验
          const signUpBtnSelector =
            ".sc-gEvEer.fQLTLP.mb-8.btn-submit.btn-large.trae__btn";
          console.log("正在尝试点击 'Sign Up' 注册按钮...");

          await page.waitForSelector(signUpBtnSelector, {
            state: "visible",
            timeout: 5000,
          });
          // 稍微延迟一下，确保前端状态已经从“不可点击”变为“可点击”
          await page.waitForTimeout(500);
          await page.click(signUpBtnSelector);

          console.log("注册按钮已点击，正在检测注册结果...");

          try {
            // 同时等待跳转成功或出现错误提示
            await Promise.race([
              // 1. 等待跳转（成功情况）
              page.waitForURL((url) => !url.href.includes("sign-up"), {
                timeout: 20000,
              }),
              // 2. 等待错误提示出现（失败情况）
              page
                .waitForSelector(".error-text:not(:empty)", {
                  state: "visible",
                  timeout: 20000,
                })
                .then(async (el) => {
                  const errorMsg = await el.innerText();
                  if (errorMsg) throw new Error(`注册失败提示: ${errorMsg}`);
                }),
            ]);

            if (!page.url().includes("sign-up")) {
              console.log(`🎉 注册成功！已跳转至: ${page.url()}`);
              console.log(`FINAL_RESULT:SUCCESS:${email}`);
            }
          } catch (e) {
            if (e.message.includes("注册失败提示")) {
              console.error(`❌ ${e.message}`);
              console.log("FINAL_RESULT:FAILURE");
            } else {
              console.log("检测超时或未知状态。当前 URL:", page.url());
              // 额外检查一下是否有隐藏的错误信息
              const errorTexts = await page.$$eval(".error-text", (els) =>
                els.map((el) => el.innerText).filter((t) => t.trim() !== ""),
              );
              if (errorTexts.length > 0) {
                console.error("❌ 检测到以下错误信息:", errorTexts.join(" | "));
              }
              console.log("FINAL_RESULT:FAILURE");
            }
          }

          console.log("流程结束。");

          // 操作完成后，保持打开供观察
          return;
        }
      }
    } catch (e) {
      console.error(`轮询出错: ${e.message}`);
    }
  }

  console.log("轮询超时，未能获取到验证码。");
}

module.exports = { runForm };

if (require.main === module) {
  const email = process.env.EMAIL || "hello@example.com";
  runForm(email).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

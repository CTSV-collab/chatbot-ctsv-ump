async function sendMessage() {
  const input = document.getElementById("userInput");
  const message = input.value.trim().toLowerCase();
  if (!message) return;

  const chatMessages = document.getElementById("chatMessages");

  // Tin nhắn người dùng
  const userDiv = document.createElement("div");
  userDiv.className = "message user";
  userDiv.textContent = message;
  chatMessages.appendChild(userDiv);

  input.value = "";
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Gửi API
  const response = await fetch("/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ question: message })
  });

  const data = await response.json();

  // Tin nhắn bot
  const botDiv = document.createElement("div");
  botDiv.className = "message bot";
  botDiv.innerHTML = data.answer;
  chatMessages.appendChild(botDiv);

  chatMessages.scrollTop = chatMessages.scrollHeight;
}
function sendQuick(text) {
  const input = document.getElementById("userInput");
  input.value = text;
  sendMessage();
}
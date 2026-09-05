# Saathi, the recorded demo

The final take of the five-minute video, cleaned from the auto-transcript
for captions and the submission form. Names and terms corrected, fillers
removed, meaning unchanged. What is on screen is in brackets. The plan it
grew out of is in `demo-script.md`; the take went its own way, and this is
the record of what was actually said.

---

## The take

[To camera.]

> Hello everyone. My name is Hemang, and this is my project, Saathi, for
> the Razorpay AI Buildathon.
>
> Agentic commerce is everywhere right now. Everyone wants an AI that can
> go out, find what you want, and buy it for you. It sounds amazing,
> doesn't it? Until you realise that giving an AI your credit card is not
> a good idea.
>
> If an LLM hallucinates in chat, you get an awkward response. But if a
> shopping agent hallucinates, or reads a malicious product description
> that tells it to ignore its budget, your bank account is the one that
> takes the hit. Valid signatures alone cannot fix that. If the context
> feeding the agent is manipulated, the agent will happily sign away your
> money.
>
> That's the problem I set out to solve with Saathi. The rule is that
> simple: the model decides what to do, the end user decides what is
> allowed, and neither can ever quietly become the other.

[Saathi's chat, `localhost:5173`.]

> So let's quickly explore the interfaces Saathi provides. Saathi has two:
> one for the end user and one for the merchant. The end user is the one
> going around the platform searching for something. So let's search for
> an SSD on Amazon.
>
> "Can you buy me an SSD from Amazon?" Let's hit enter.
>
> As you can see, it is reading and understanding my request. In a little
> while I get a question: what details does it need? What type of SSD,
> what capacity, and how much am I willing to spend at most. So I say: I
> need an internal SSD, the capacity should be two terabytes, and the
> maximum spend is forty thousand.
>
> After that, Saathi launches a Docker sandbox on my machine that does the
> searching, and once the searches are done it recommends options. Let's
> wait for the Docker cold start.
>
> The container is up, and the search is running on amazon.in. In ten to
> fifteen seconds it will be ready and tell me a product I can buy. If
> there are multiple products, it recommends multiple, but for this
> particular query there is only one. So let's go for it. I hold to agree.

[The sandbox window.]

> Now it launches a sandbox that I can also watch. As you can see, the
> sandbox is open. It has clicked the cart button, and now it proceeds to
> buy. After that, a sign-in prompt is waiting for me.
>
> There are two things you can do here in Saathi. First, automatic
> sign-in, where Saathi enters the credentials itself. Second, Saathi
> handing you the wheel to do it. For this demo, it has handed me the
> wheel and I can enter the credentials myself.
>
> And if automatic sign-in is on, Saathi never reads your credentials. The
> agent is only given a key. That key lets the browser fill in the value,
> but the agent never learns what the value is. So your credentials are
> never exposed.

[The merchant side, `localhost:5174`.]

> So let's go to the other side of Saathi, the merchant. As you can see, I
> have done a run: buy me a navy kurta, medium size, up to two thousand
> five hundred rupees. It searched the shop, one item actually fit our
> conditions, it built the cart, and I went to pay. And the cart was
> refused. It was refused because it did not pass certain checks, and it
> shows why the cart was blocked.
>
> We also look for dark patterns by a merchant. This is the merchant
> interface, where a merchant can come and list things. As you can see,
> this merchant has been flagged for a dark pattern: scarcity. It can also
> be a discount pattern, where a merchant says there is a discount of
> eighteen hundred rupees, but only for two days or ten days. That is a
> dark pattern too.
>
> Coming over to the chat, the merchant can ask why they are not getting
> picked. As you can see, it reads our ledger and says that one of your
> listings carries copy that the agent will flag, which is the dark
> pattern.

[To camera.]

> There is a lot more to explore, but this is what I could show in five
> minutes. Have a good day ahead.

---

## Every claim in the take, checked against the code

- **The searching happens in a Docker sandbox on your machine.** True.
  The browser is a throwaway Chrome in a container driven by
  `packages/browser-drive`, with nothing from your own browser in it.
- **Hold to agree.** True. The chat's agree control is a press-and-hold in
  `apps/audit-ui/src/conversation/ChatSession.tsx`, and the bill uses the
  same gesture as "Hold to buy".
- **A sandbox you can watch, and a wheel it hands you.** True. The window
  card in `apps/audit-ui/src/browser/BrowserSessionCard.tsx` says "The
  window is yours" when Saathi stops at a sign-in.
- **Automatic sign-in never shows the agent your password.** True, and
  the mechanism is slightly stronger than the take says. The agent's
  sign-in tool takes no arguments at all. A vault is matched by the page
  the window is on, the value goes straight into the browser's typing, and
  the record of those keystrokes carries no characters. See
  `apps/agent-host/src/browser/web-sign-in.ts` and
  `packages/browser-drive/src/drive/sign-in-typing.ts`. If you ever redo
  the captions, this line is the accurate one: "The agent never receives
  the password. It calls one sign-in tool with no arguments; the vault
  matches the page, the browser types it, and the log keeps no
  characters."
- **A refused cart shows why.** True. Every cart is checked against the
  signed limits and the merchant's signed price, and a refusal carries a
  reason code and a human line (`packages/gateway/src/checks/`).
- **Dark patterns, including scarcity and short-lived discounts.** True.
  The shield in `packages/memory/src/manipulation/patterns.ts` names
  eight: scarcity, urgency, false anchor, drip pricing, confirmshaming,
  preselection, social proof, obstruction. "Only for two days" is urgency;
  "was 2,999, today 1,899" is a false anchor.
- **The merchant can ask why they are not being picked, and the answer
  reads the ledger.** True. The composer in the merchant UI says "Ask
  about your shop", and the answers are read off the same ledger the
  buyer's side writes.

Not in the take: the attack harness run and the memory digest from the
written script. Both still work if a second short clip is ever wanted.

---

## For the submission form

> Saathi is a shopping agent that dances for you, not for the shop. You say
> what you want once. Saathi writes it down in your words as a signed
> limit, walks the shop in a sandboxed browser you can watch, and cannot
> spend past what you signed, whatever a product page tells it. It never
> sees your password: sign-in goes through a vault the model cannot read,
> or the window is handed back to you. Every price it reads is filed with
> the trust it deserves, and a cart that fails a check is refused with the
> reason. Merchants get the other side of the counter: a listing audit that
> flags dark patterns before AI buyers do, and a chat that reads the ledger
> to explain why agents pick them or walk past. Payments run on Razorpay
> test mode.

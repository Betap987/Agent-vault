;; Agent Vault Core Protocol
;; MVP Hackathon Version
;;
;; Mode: Custodial "Execution Sandbox" (Clarity 2.1)
;; - Owner funds sandbox (deposit)
;; - Agent executes autonomously within policies (as-contract execution)
;; - Owner can pause / rotate agent / update limits / update whitelist / withdraw

;; ==============================
;; Errors
;; ==============================

(define-constant ERR-NOT-OWNER (err u100))
(define-constant ERR-NOT-AGENT (err u101))
(define-constant ERR-PAUSED (err u102))
(define-constant ERR-NOT-WHITELISTED (err u103))
(define-constant ERR-LIMIT-EXCEEDED (err u104))
(define-constant ERR-INSUFFICIENT-BALANCE (err u105))
(define-constant ERR-NO-VAULT (err u106))
(define-constant ERR-ALREADY-INITIALIZED (err u107))
(define-constant ERR-INVALID-AMOUNT (err u108))

;; ==============================
;; Storage
;; ==============================

(define-map vault-config
  { owner: principal }
  {
    agent: principal,
    paused: bool,
    window-blocks: uint,
    stx-limit: uint,
    ft-limit: uint
  }
)

(define-map vault-state
  { owner: principal }
  {
    window-start: uint,
    spent-stx: uint,
    spent-ft: uint
  }
)

(define-map vault-whitelist
  { owner: principal }
  { recipients: (list 10 principal) }
)

;; Logical sandbox balance per owner (custodial ledger)
(define-map vault-balance
  { owner: principal }
  { stx: uint }
)

;; ==============================
;; Public Functions
;; ==============================

(define-public (init-vault
    (agent principal)
    (whitelist (list 10 principal))
    (window-blocks uint)
    (stx-limit uint)
    (ft-limit uint)
  )
  (let (
        (owner tx-sender)
        (existing (map-get? vault-config { owner: owner }))
       )
    (if (is-some existing)
        ERR-ALREADY-INITIALIZED
        (begin
          ;; Save config
          (map-set vault-config
            { owner: owner }
            {
              agent: agent,
              paused: false,
              window-blocks: window-blocks,
              stx-limit: stx-limit,
              ft-limit: ft-limit
            }
          )

          ;; Initialize state
          (map-set vault-state
            { owner: owner }
            {
              window-start: burn-block-height,
              spent-stx: u0,
              spent-ft: u0
            }
          )

          ;; Save whitelist
          (map-set vault-whitelist
            { owner: owner }
            { recipients: whitelist }
          )

          ;; Initialize balance
          (map-set vault-balance
            { owner: owner }
            { stx: u0 }
          )

          (print { event: "vault-initialized", owner: owner, agent: agent, block: burn-block-height })
          (ok true)
        )
    )
  )
)

;; ---- Custodial funding / reclaiming ----

(define-public (deposit-stx (owner principal) (amount uint))
  (if (not (is-eq tx-sender owner))
      ERR-NOT-OWNER
      (let ((config (map-get? vault-config { owner: owner })))
        (if (is-none config)
            ERR-NO-VAULT
            (begin
              ;; Move STX from owner -> contract principal
              (try! (stx-transfer? amount owner (as-contract tx-sender)))

              ;; Update logical balance
              (let ((bal (default-to { stx: u0 } (map-get? vault-balance { owner: owner }))))
                (map-set vault-balance
                  { owner: owner }
                  { stx: (+ (get stx bal) amount) }
                )
              )

              (print { event: "deposit-stx", owner: owner, amount: amount, block: burn-block-height })
              (ok true)
            )
        )
      )
  )
)

(define-public (withdraw-stx (owner principal) (amount uint))
  (if (not (is-eq tx-sender owner))
      ERR-NOT-OWNER
      (let (
            (config (map-get? vault-config { owner: owner }))
            (bal (default-to { stx: u0 } (map-get? vault-balance { owner: owner })))
           )
        (if (is-none config)
            ERR-NO-VAULT
            (if (> amount (get stx bal))
                ERR-INSUFFICIENT-BALANCE
                (begin
                  ;; Move STX from contract principal -> owner
                  (try! (as-contract (stx-transfer? amount tx-sender owner)))

                  ;; Update logical balance
                  (map-set vault-balance
                    { owner: owner }
                    { stx: (- (get stx bal) amount) }
                  )

                  (print { event: "withdraw-stx", owner: owner, amount: amount, block: burn-block-height })
                  (ok true)
                )
            )
        )
      )
  )
)

;; ---- Admin controls ----

(define-public (set-paused (owner principal) (paused bool))
  (let ((config (map-get? vault-config { owner: owner })))
    (if (is-none config)
        ERR-NO-VAULT
        (if (not (is-eq tx-sender owner))
            ERR-NOT-OWNER
            (begin
              (map-set vault-config
                { owner: owner }
                (merge (unwrap-panic config) { paused: paused })
              )
              (print { event: "paused-updated", owner: owner, paused: paused, block: burn-block-height })
              (ok true)
            )
        )
    )
  )
)

(define-public (set-agent (owner principal) (new-agent principal))
  (let ((config (map-get? vault-config { owner: owner })))
    (if (is-none config)
        ERR-NO-VAULT
        (if (not (is-eq tx-sender owner))
            ERR-NOT-OWNER
            (begin
              (map-set vault-config
                { owner: owner }
                (merge (unwrap-panic config) { agent: new-agent })
              )
              (print { event: "agent-updated", owner: owner, agent: new-agent, block: burn-block-height })
              (ok true)
            )
        )
    )
  )
)

(define-public (set-whitelist (owner principal) (whitelist (list 10 principal)))
  (let ((config (map-get? vault-config { owner: owner })))
    (if (is-none config)
        ERR-NO-VAULT
        (if (not (is-eq tx-sender owner))
            ERR-NOT-OWNER
            (begin
              (map-set vault-whitelist
                { owner: owner }
                { recipients: whitelist }
              )
              (print { event: "whitelist-updated", owner: owner, block: burn-block-height })
              (ok true)
            )
        )
    )
  )
)

(define-public (set-limits (owner principal) (stx-limit uint) (ft-limit uint) (window-blocks uint))
  (let ((config (map-get? vault-config { owner: owner })))
    (if (is-none config)
        ERR-NO-VAULT
        (if (not (is-eq tx-sender owner))
            ERR-NOT-OWNER
            (begin
              (map-set vault-config
                { owner: owner }
                (merge (unwrap-panic config) {
                  stx-limit: stx-limit,
                  ft-limit: ft-limit,
                  window-blocks: window-blocks
                })
              )
              (print { event: "limits-updated", owner: owner, block: burn-block-height })
              (ok true)
            )
        )
    )
  )
)

;; ---- Agent execution (custodial) ----
(define-public (execute-stx-transfer
    (owner principal)
    (recipient principal)
    (amount uint)
  )
  (let (
        (v (try! (validate-stx-transfer owner recipient amount)))
        (st (unwrap! (map-get? vault-state { owner: owner }) ERR-NO-VAULT))
        (bal (default-to { stx: u0 } (map-get? vault-balance { owner: owner })))
        (new-total (get new-total v))
        (balance-after (- (get stx bal) amount))
       )
    (try! (as-contract (stx-transfer? amount tx-sender recipient)))
    (begin
      (map-set vault-state
        { owner: owner }
        {
          window-start: (get window-start st),
          spent-stx: new-total,
          spent-ft: (get spent-ft st)
        }
      )
      (map-set vault-balance
        { owner: owner }
        { stx: balance-after }
      )
      (print {
        event: "stx-transfer-executed",
        owner: owner,
        agent: tx-sender,
        recipient: recipient,
        amount: amount,
        spent_in_window: new-total,
        balance_after: balance-after,
        block: burn-block-height
      })
      (ok {
        executed: true,
        owner: owner,
        agent: tx-sender,
        recipient: recipient,
        amount: amount,
        spent_in_window: new-total,
        balance_after: balance-after
      })
    )
  )
)
;; ==============================
;; Internal Logic
;; ==============================

(define-private (maybe-reset-window (owner principal))
  (let (
        (config (map-get? vault-config { owner: owner }))
        (state (map-get? vault-state { owner: owner }))
       )

    (if (or (is-none config) (is-none state))
        false

        (let (
              (cfg (unwrap-panic config))
              (st (unwrap-panic state))
              (window-end (+ (get window-start st) (get window-blocks cfg)))
             )

          (if (>= burn-block-height window-end)

              (begin
                (map-set vault-state
                  { owner: owner }
                  {
                    window-start: burn-block-height,
                    spent-stx: u0,
                    spent-ft: u0
                  }
                )
                true
              )

              false
          )
        )
    )
  )
)

(define-private (assert-vault-exists (owner principal))
  (begin
    (unwrap! (map-get? vault-config { owner: owner }) ERR-NO-VAULT)
    (unwrap! (map-get? vault-state { owner: owner }) ERR-NO-VAULT)
    (unwrap! (map-get? vault-whitelist { owner: owner }) ERR-NO-VAULT)
    (ok true)
  )
)

(define-private (is-whitelisted (owner principal) (recipient principal))
  (let ((wl (map-get? vault-whitelist { owner: owner })))
    (if (is-none wl)
        false
        (let ((recipients (get recipients (unwrap-panic wl))))
          (is-some (index-of recipients recipient))
        )
    )
  )
)

(define-private (validate-stx-transfer (owner principal) (recipient principal) (amount uint))
  (begin
    (try! (assert-vault-exists owner))

    (let (
          (cfg (unwrap-panic (map-get? vault-config { owner: owner })))
         )
      ;; caller must be agent
      (asserts! (is-eq tx-sender (get agent cfg)) ERR-NOT-AGENT)

      ;; must not be paused
      (asserts! (not (get paused cfg)) ERR-PAUSED)

      ;; amount must be > 0
      (asserts! (> amount u0) ERR-INVALID-AMOUNT)

      ;; recipient must be whitelisted
      (asserts! (is-whitelisted owner recipient) ERR-NOT-WHITELISTED)

      ;; reset window if needed (mutates state)
      (if (maybe-reset-window owner) true true)

      ;; compute new totals
      (let (
            (st (unwrap-panic (map-get? vault-state { owner: owner })))
            (new-total (+ (get spent-stx st) amount))
            (bal (default-to { stx: u0 } (map-get? vault-balance { owner: owner })))
           )
        ;; limit check
        (asserts! (<= new-total (get stx-limit cfg)) ERR-LIMIT-EXCEEDED)

        ;; balance check
        (asserts! (<= amount (get stx bal)) ERR-INSUFFICIENT-BALANCE)

        (ok {
          new-total: new-total,
          balance_before: (get stx bal)
        })
      )
    )
  )
)

(define-private (assert-owner (owner principal))
  (begin
    (asserts! (is-eq tx-sender owner) ERR-NOT-OWNER)
    (ok true)
  )
)
;; ==============================
;; Read-only Getters
;; ==============================

(define-read-only (get-config (owner principal))
  (map-get? vault-config { owner: owner })
)

(define-read-only (get-state (owner principal))
  (map-get? vault-state { owner: owner })
)

(define-read-only (get-whitelist (owner principal))
  (map-get? vault-whitelist { owner: owner })
)

(define-read-only (get-balance (owner principal))
  (map-get? vault-balance { owner: owner })
)

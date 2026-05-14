// CAEN Shooting League — Dati
// Modifica questo file per aggiornare classifiche e post

var CSL = {
  config: {
    nome: "CAEN Shooting League",
    abbreviazione: "CSL",
    stagione_attiva: "s1-2026",
    colpi_per_partita: 5,
    punteggio_massimo: 50,
    durata_stagione_mesi: 3,
    zone: [
      { nome: "Bullseye", colore: "#b71c1c", punti: 10 },
      { nome: "Zona 2",   colore: "#bf360c", punti: 9  },
      { nome: "Zona 3",   colore: "#f57f17", punti: 8  },
      { nome: "Zona 4",   colore: "#2e7d32", punti: 7  },
      { nome: "Zona 5",   colore: "#1565c0", punti: 6  },
      { nome: "Zona 6",   colore: "#006064", punti: 5  },
      { nome: "Zona 7",   colore: "#4e342e", punti: 4  },
      { nome: "Zona 8",   colore: "#827717", punti: 3  },
      { nome: "Zona 9",   colore: "#880e4f", punti: 2  },
      { nome: "Fuori",    colore: "#212121", punti: 1  }
    ]
  },

  // Popolato automaticamente da data/classifica.js (generato da scripts/aggiorna.py)
  stagioni: [],

  // ── COME AGGIUNGERE UN POST ────────────────────────────────
  // Copia il blocco qui sotto, incollalo come primo elemento dell'array,
  // cambia i campi e salva. Il sito si aggiorna subito.
  //
  // slug    : identificatore URL, senza spazi né accenti ("prima-partita")
  // titolo  : titolo visibile
  // data    : "YYYY-MM-DD"
  // autore  : stringa libera
  // tag     : array di tag, es. ["risultati", "record"]
  // excerpt : testo breve mostrato nella card (max ~150 caratteri)
  // content : corpo del post in Markdown (usa backtick template literal)

  posts: [
    {
      slug: "nuovo-sistema-punti-2026",
      titolo: "Nuovo regolamento punti e spareggi: la costanza decide anche i pareggi",
      data: "2026-05-14",
      autore: "M",
      tag: ["regolamento", "classifica", "analisi"],
      excerpt: "La nuova revisione del regolamento conferma il sistema punti giornata e rende i pareggi tecnicamente risolvibili con spareggi ufficiali, pubblici e retroattivi.",
      content: `# Nuovo regolamento punti e spareggi: la costanza decide anche i pareggi

    La revisione del regolamento riguarda ora due livelli distinti ma collegati: la distribuzione dei punti giornata e la gestione dei pareggi. Entrambi sono stati ridefiniti in modo formale, tecnico e retroattivo.

    L'obiettivo è semplice: se due o tre giocatori ottengono lo stesso miglior tentativo, non possono essere trattati come perfettamente equivalenti quando uno dei due ha costruito una serie complessivamente migliore. La CAEN Shooting League vuole premiare la costanza, non soltanto il picco isolato.

    ## La filosofia del cambiamento

    Il primo aggiornamento aveva già allargato la zona punti fino al 10° posto. Questa revisione completa il disegno: non basta distribuire meglio i punti, bisogna anche ordinare meglio i pareggi.

    In altre parole:

    - il colpo eccezionale resta importantissimo;
    - la qualità media della serie conta davvero;
    - la profondità della prestazione conta più del semplice fatto di avere toccato una volta lo stesso tetto di un altro.

    Per questo motivo le classifiche ufficiali non si fermano più al primo valore uguale trovato. Ogni graduatoria ha ora una catena di spareggi esplicita e pubblica.

    ## Sistema punti giornata confermato

    La tabella punti giornata introdotta con il primo aggiornamento resta confermata ed è la base di tutta la classifica campionato:

    - 1° posto: 10 punti
    - 2° posto: 8 punti
    - 3° posto: 6 punti
    - 4°-5° posto: 4 punti
    - 6°-7° posto: 2 punti
    - 8°-10° posto: 1 punto
    - 11° posto e oltre: 0 punti

    Questo schema è stato scelto per allargare il valore sportivo della continuità. Il vecchio modello **3-2-1** riconosceva quasi soltanto il podio e appiattiva tutto il resto. Il modello attuale legge meglio il rendimento campionato, perché distingue chi entra spesso nelle prime fasce da chi alterna un picco a molte giornate anonime.

    In termini pratici:

    - una vittoria isolata vale 10 punti;
    - tre quinti posti valgono 12 punti;
    - due secondi posti valgono 16 punti;
    - cinque piazzamenti tra ottavo e decimo valgono 5 punti.

    Il messaggio competitivo è preciso: vincere una giornata conta molto, ma non deve cancellare il valore di chi costruisce piazzamenti alti con continuità.

    ## Perché serviva aggiornare anche i pareggi

    Una volta allargata la tabella punti, era necessario rendere più rigoroso anche l'ordine di arrivo. Altrimenti il sistema avrebbe continuato a premiare nello stesso modo giocatori con serie tecnicamente diverse solo perché accomunati dallo stesso miglior tentativo.

    Il nuovo regolamento chiude proprio questo buco: a parità di best, conta la qualità complessiva della serie e non soltanto il colpo più alto.

    ## Classifica giornata: nuova catena di spareggio

    Per ogni giornata ufficiale la classifica è ordinata così:

    1. miglior tentativo;
    2. media esatta sui tre tentativi ufficiali della giornata;
    3. secondo miglior tentativo della giornata.

    ### Definizione operativa della media 3T

    La media di spareggio non è una media vaga o interpretativa: è la media aritmetica di **T1**, **T2** e **T3**.

    Se un tentativo non è stato effettuato e quindi è registrato come **-1**, ai soli fini dello spareggio quel valore viene trattato come **0**.

    Questo punto è fondamentale perché impedisce un abuso evidente: non completare la serie non può produrre un vantaggio competitivo nello spareggio.

    ### Definizione del 2° best

    Il terzo criterio non guarda all'ordine cronologico dei tentativi ma alla loro qualità. Si prendono i tre valori ufficiali della giornata, si convertono eventuali **-1** in **0** ai soli fini dello spareggio, si ordinano dal più alto al più basso e si confronta il secondo valore.

    Se anche questo coincide, il pareggio resta reale e la posizione viene condivisa.

    ## Classifica campionato: nuova catena di spareggio

    La classifica campionato è ora ordinata così:

    1. punti campionato;
    2. media tiro stagionale esatta;
    3. punti tiro stagionali;
    4. record ufficiale stagionale.

    La media tiro stagionale esatta è il rapporto tra i punti tiro e il numero di giornate ufficiali disputate. Il sito mostra il valore in modo leggibile, ma lo spareggio usa il valore esatto generato dal sistema, non una versione troncata a un solo decimale.

    Il senso sportivo della sequenza è preciso:

    - prima conta il piazzamento trasformato in punti;
    - poi conta quanto regolarmente un giocatore produce best giornalieri alti;
    - poi conta quanto ha accumulato nel complesso;
    - solo in ultima istanza entra il picco assoluto del record.

    ## Classifica cecchini: criteri ufficiali

    La classifica cecchini è separata dalla classifica campionato e da oggi usa soltanto tentativi ufficiali, cioè tentativi registrati in una giornata di gara o in un recupero assegnato. L'allenamento libero non assegna il titolo di cecchino.

    L'ordine ufficiale è questo:

    1. record ufficiale stagionale;
    2. media tiro stagionale esatta;
    3. secondo miglior tentativo ufficiale della stagione;
    4. punti tiro stagionali.

    Anche qui il principio è coerente con la filosofia della lega: se due giocatori hanno lo stesso record, prevale chi ha dimostrato una qualità media migliore; se anche la media coincide, prevale chi ha una seconda cartuccia più forte e quindi un livello alto più ripetibile.

    ## Esempi concreti già emersi nella Stagione 1 2026

    La nuova logica non è teorica. Ha già effetti misurabili sulle giornate registrate.

    ### Giornata 3: triplo pareggio a 21

    Nella giornata del **2026-05-11** tre giocatori chiudono con **21** come miglior tentativo:

    - Gianluca Becuzzi: media 3T **15,000**
    - Alberto Niccolai: media 3T **13,667**
    - Matteo Brini: media 3T **12,667**

    Con il vecchio approccio sarebbero stati trattati come sostanzialmente equivalenti sul primo criterio. Con il nuovo regolamento il loro ordine è leggibile e difendibile: Becuzzi davanti a Niccolai, Niccolai davanti a Brini.

    ### Giornata 1: stesso best, serie diversa

    Nella giornata del **2026-05-04** Emanuele Bertolucci e Matteo Brini chiudono entrambi con **12** di miglior tentativo. Il pareggio però si scioglie subito sulla media 3T:

    - Bertolucci: **12, 7, 4** → media **7,667**
    - Brini: **1, 12, 5** → media **6,000**

    Il regolamento ora riconosce che la prima è una serie più solida della seconda.

    ### Campionato: Brini davanti a Pepe a pari punti

    Nell'assetto attuale Matteo Brini e Francesco Pepe sono appaiati a **13** punti campionato. La classifica non li lascia più indistinti:

    - Brini ha media tiro esatta **17,250**
    - Pepe ha media tiro esatta **17,000**

    Quindi Brini resta davanti. Non per un colpo miracoloso, ma perché a parità di punti campionato ha costruito una media giornaliera più alta.

    ## Impatto retroattivo

    La revisione è stata applicata retroattivamente a tutte le giornate già registrate. Non è stato ritoccato nessun numero a mano: il motore di generazione ha ricalcolato l'intera stagione partendo dai file risultati.

    Questo significa che:

    - la tabella punti giornata aggiornata continua a valere per tutte le giornate già registrate;
    - le giornate storiche sono state riordinate con i nuovi spareggi;
    - i punti campionato sono stati riassegnati in base al nuovo ordine di arrivo;
    - la classifica campionato è stata ricostruita da zero;
    - la classifica cecchini ora usa criteri più rigorosi e solo tentativi ufficiali;
    - anche i dati derivati del sito sono stati riallineati automaticamente.

    Il risultato non è un regolamento più complicato per gusto di complicarlo. È un regolamento più preciso, meno attaccabile e più coerente con l'idea di fondo della CSL: la costanza deve valere davvero, anche quando il tabellone sembra dire che due risultati sono uguali.`.replace(/^ {4}/gm, '')
    },
    {
      slug: "benvenuti",
      titolo: "La CAEN Shooting League è ufficialmente aperta.",
      data: "2026-05-01",
      autore: "M",
      tag: ["annuncio"],
      excerpt: "Il campionato interno di Nerf shooting parte oggi. Cinque colpi, un bersaglio, nessuna scusa.",
      content: `# La CAEN Shooting League è aperta.

Da oggi è attiva la **Stagione 1**.

Le regole sono semplici: cinque colpi, un bersaglio, vince il punteggio più alto.
La classifica viene azzerata ogni tre mesi.

Consultate il [Regolamento](regolamento.html) prima di scendere in campo.

Buona fortuna a tutti — ne avrete bisogno.`
    },
    {
        slug: "2026-s1",
        titolo: "La pedana della Stagione 1 2026 è pronta",
        data: "2026-05-04",
        autore: "M",
        tag: ["annuncio", "stagione", "regolamento"],
        excerpt: "La pedana è allestita, i bersagli sono appesi, le classifiche sono vuote. Che la Stagione 1 abbia inizio.",
        content: `# La pedana della Stagione 1 2026 è pronta

La pedana è allestita, i bersagli sono appesi, le classifiche sono vuote. Che la Stagione 1 abbia inizio.

Allestimento della pedana:

- Bersaglio appeso su lavagna bianca, disposta sul tavolo affiancato al muro,
- Per tirare il giocatore si posiziona sul lato opposto della stanza, toccando con una parte del corpo l'armadio alle sue spalle.

Il bersaglio di questa stagione è stato gentilmente offerto da Gianluca, che ringraziamo per il supporto.`
    },
    {
        slug: "2026-s1-giocatori",
        titolo: "I giocatori della Stagione 1 2026",
        data: "2026-05-06",
        autore: "M",
        tag: ["annuncio", "stagione", "giocatori"],
        excerpt: "Dopo due giornate si delinea il campo di battaglia: veterani, nuove promesse e qualche sorpresa già nelle prime ore di campionato.",
        content: `# I giocatori della Stagione 1 2026

Dopo due giornate si comincia a capire chi è qui per vincere e chi è qui per imparare a perdere con stile. Undici sfidanti nella prima giornata, tredici nella seconda — il roster cresce, i bersagli si riempiono di buchi, le classifiche iniziano a prendere forma.

Facciamo le presentazioni.

---

## I Veterani

### Matteo Brini — Il Fondatore

C'è un uomo senza cui questa lega non esisterebbe. Quell'uomo ha chiuso la prima giornata con **12 punti**, piazzandosi ottavo. È il fondatore della CSL, l'architetto del regolamento, il custode del bersaglio — e per ora anche uno di coloro che non ha ancora vinto una giornata.

Nella seconda giornata ha risposto presente con **17 punti**, salendo in classifica. La mira si sta affinando. Chi conosce Brini sa che non è il tipo da restare in fondo a lungo — la sensazione è che stia solo studiando il campo prima di affondare il colpo.

O almeno, è quello che racconta lui stesso.

### Francesco Pepe — Il Terzo Incomodo

Tre nel podio della classifica dopo la seconda giornata. Terzo per punti campionato. Francesco Pepe si presenta con **16 punti** alla prima giornata — regolare, preciso, senza fronzoli. Alla seconda giornata si conferma con un doppio **23 punti**, un risultato che lo solleva a secondo classificato della giornata 2. 

Il problema di stare terzo è che c'è sempre qualcuno davanti. Il problema di Francesco è che lui lo sa, e questa consapevolezza potrebbe rivelarsi il suo carburante per le prossime settimane. Occhio alla progressione: è il tipo di giocatore che migliora in silenzio finché non è troppo tardi per fermarlo.

---

## Il Caso della Settimana

### Andrea Picchi — Il Grande Riscatto

Partiamo dai numeri, perché i numeri non mentono: **0, 1, 3**. Questo è il referto della prima giornata di Andrea Picchi. Tre tentativi, un totale di quattro punti, ultimo in classifica con distacco. Se il bersaglio fosse stato più piccolo, forse avrebbe fatto meglio a caso.

Ma Picchi non è il tipo da sparire. Alla seconda giornata si ripresenta, imbraccia il blaster e segna **11**. Non è ancora un podio, ma è una resurrezione. La traiettoria è quella giusta: da zero a undici in quarantotto ore. Se questo tasso di miglioramento regge, a luglio qualcuno potrebbe trovarsi spiacevolmente sorpreso.

Il riscatto è iniziato. La storia non è ancora scritta.

---

## Le Rivelazioni

### Andrea Romboli — Il Colpo da 26

Giornata 1, primo turno ufficiale della stagione. Mentre la maggior parte dei giocatori si assestava tra i 12 e i 18, Andrea Romboli si è presentato e ha sparato **26**. Il miglior punteggio della prima giornata, staccato di ben sette punti dal secondo classificato.

Assente nella seconda giornata, ma il segnale è stato forte e chiaro: Romboli sa come si usa un blaster. Quando torna, le classifiche potrebbero cambiare faccia.

### Andrea Della Maggiora — Il Nuovo Arrivato Mette Paura

Esordio nella seconda giornata. Nessun riscaldamento, nessun rodaggio: **29 punti** al primo turno ufficiale. Il miglior punteggio di giornata 2, ottenuto da un giocatore che non aveva mai tirato in gara. Andrea Della Maggiora entra nel campionato con il piglio di chi non è venuto a fare amicizia.

Se la traiettoria regge, a giugno si parlerà molto di lui.

### Tommaso Banchini — La Costanza Silenziosa

**19 punti** alla prima giornata, **14** alla seconda. Meno rumore di altri, ma sempre nelle posizioni alte. Banchini non fa notizia, non fa dichiarazioni, mette la pallina sul bersaglio e torna al suo posto. Il tipo di giocatore che ti ritrovi in testa alla classifica senza che tu te ne sia accorto.

---

## Il Resto del Gruppo

**Alberto Niccolai** terzo in classifica dopo giornata 1 con 18 punti e ha confermato il trend con 21 nella seconda — in miglioramento, forse il favorito al momento. **Chiara Tomaiuolo** è la costanza fatta persona: 17 e 18, un'ottima media, sempre lì. **Emanuele Bertolucci** ha risposto con 20 punti nella seconda giornata dopo un opaco 12 all'esordio. **Antonio Nicolosi** e **Francesco Rogo** completano il gruppo con rendimenti alterni — ancora in cerca del loro picco.

Nuovi ingressi dalla giornata 2: **Andrea Strappato** e **Giovanni Cerretani**, arrivati con discrezione. Il campionato è lungo — chi arriva tardi ha ancora tutto il tempo per recuperare.

---

## La Previsione

Siamo a due giornate su ventisei. Chiunque vinca oggi non ha ancora vinto niente. Chiunque sia ultimo oggi non ha ancora perso niente.

La Stagione 1 dura fino al 31 luglio. Nel mezzo ci sono altri colpi da sparare, altri lunedì e mercoledì, altre occasioni per salire o scendere. La classifica è un foglio bianco con qualche numero — e il bello è che quei numeri cambieranno.

Tornate ad allenarvi.`
    }
  ]

};

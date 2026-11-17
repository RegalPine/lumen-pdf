export interface PdfPageContent {
  page: number;
  headerRight: string;
  sectionTitle: string;
  paragraphs: string[];
  equation?: {
    line1: string;
    line2: string;
    number: string;
  };
  hasFigure2?: boolean;
  footerLeft: string;
}

export const PDF_PAGES: PdfPageContent[] = [
  {
    page: 1,
    headerRight: 'Vaswani et al. — Attention Is All You Need',
    sectionTitle: '1. Introduction',
    paragraphs: [
      'Recurrent neural networks, long short-term memory and gated recurrent neural networks in particular, have been firmly established as state of the art approaches in sequence modeling and transduction problems such as language modeling and machine translation.',
      'Recurrent models typically factor computation along the symbol positions of the input and output sequences. Aligning the positions to steps in computation time, they generate a sequence of hidden states h_t, as a function of the previous hidden state h_{t-1} and the input for position t. This inherently sequential nature precludes parallelization within training examples.',
      'In this work we propose the Transformer, a model architecture eschewing recurrence and instead relying entirely on an attention mechanism to draw global dependencies between input and output.',
    ],
    footerLeft: 'Section 1 — Introduction & Background',
  },
  {
    page: 2,
    headerRight: 'Vaswani et al. — Attention Is All You Need',
    sectionTitle: '2. Model Architecture',
    paragraphs: [
      'Most competitive neural sequence transduction models have an encoder-decoder structure. Here, the encoder maps an input sequence of symbol representations (x_1, ..., x_n) to a sequence of continuous representations z = (z_1, ..., z_n).',
      'Given z, the decoder then generates an output sequence (y_1, ..., y_m) of symbols one element at a time. At each step the model is auto-regressive, consuming the previously generated symbols as additional input when generating the next.',
    ],
    footerLeft: 'Section 2 — Model Architecture',
  },
  {
    page: 3,
    headerRight: 'Vaswani et al. — Attention Is All You Need',
    sectionTitle: '2.1 Encoder & Decoder Stacks',
    paragraphs: [
      'The encoder is composed of a stack of N = 6 identical layers. Each layer has two sub-layers. The first is a multi-head self-attention mechanism, and the second is a simple, position-wise fully connected feed-forward network.',
      'We employ a residual connection around each of the two sub-layers, followed by layer normalization. That is, the output of each sub-layer is LayerNorm(x + Sublayer(x)), where Sublayer(x) is the function implemented by the sub-layer itself.',
    ],
    footerLeft: 'Section 2.1 — Residual Connections & Normalization',
  },
  {
    page: 4,
    headerRight: 'Vaswani et al. — Attention Is All You Need',
    sectionTitle: '3.2 Multi-Head Attention',
    paragraphs: [
      'Instead of performing a single attention function with d_model-dimensional keys, values and queries, we found it beneficial to linearly project the queries, keys and values h times with different, learned linear projections to d_k, d_k and d_v dimensions, respectively.',
      'Multi-head attention allows the model to jointly attend to information from different representation subspaces at different positions. With a single attention head, averaging inhibits this.',
      'In this work we employ h = 8 parallel attention layers, or heads. For each of these we use d_k = d_v = d_model / h = 64. Due to the reduced dimension of each head, the total computational cost is similar to that of single-head attention with full dimensionality [14, 31].',
    ],
    equation: {
      line1: 'MultiHead(Q, K, V) = Concat(head₁, ..., headₕ) Wᴼ',
      line2: 'where headᵢ = Attention(Q Wᵢᴼ, K Wᵢᴷ, V Wᵢⱽ)',
      number: '(2)',
    },
    hasFigure2: true,
    footerLeft: 'Section 3.2 — Deep Learning Architecture',
  },
  {
    page: 5,
    headerRight: 'Vaswani et al. — Attention Is All You Need',
    sectionTitle: '3.3 Position-wise Feed-Forward Networks',
    paragraphs: [
      'In addition to attention sub-layers, each of the layers in our encoder and decoder contains a fully connected feed-forward network, which is applied to each position separately and identically. This consists of two linear transformations with a ReLU activation in between.',
      'FFN(x) = max(0, x W_1 + b_1) W_2 + b_2. While the linear transformations are the same across different positions, they use different parameters from layer to layer.',
    ],
    footerLeft: 'Section 3.3 — Feed-Forward Layers',
  },
  {
    page: 6,
    headerRight: 'Vaswani et al. — Attention Is All You Need',
    sectionTitle: '3.4 Embeddings and Softmax & Positional Encoding',
    paragraphs: [
      'Similarly to other sequence transduction models, we use learned embeddings to convert the input tokens and output tokens to vectors of dimension d_model. In our model, we share the same weight matrix between the two embedding layers and the pre-softmax linear transformation.',
      'Since our model contains no recurrence and no convolution, in order for the model to make use of the order of the sequence, we must inject some information about the relative or absolute position of the tokens in the sequence.',
    ],
    footerLeft: 'Section 3.4 — Positional Encoding',
  },
  {
    page: 7,
    headerRight: 'Vaswani et al. — Attention Is All You Need',
    sectionTitle: '4. Why Self-Attention & Training Routine',
    paragraphs: [
      'We compare various aspects of self-attention layers to the recurrent and convolutional layers commonly used for mapping one variable-length sequence of symbol representations to another sequence of equal length.',
      'Three desiderata motivate self-attention: total computational complexity per layer, the amount of computation that can be parallelized, and the path length between long-range dependencies in the network.',
    ],
    footerLeft: 'Section 4 — Self-Attention Complexity',
  },
  {
    page: 8,
    headerRight: 'Vaswani et al. — Attention Is All You Need',
    sectionTitle: '4.1 Optimizer & Learning Rate Schedule',
    paragraphs: [
      'We trained on the standard WMT 2014 English-German dataset consisting of about 4.5 million sentence pairs. Sentences were encoded using byte-pair encoding, which has a shared source-target vocabulary of about 37,000 tokens.',
      'We used the Adam optimizer with beta_1 = 0.9, beta_2 = 0.98 and epsilon = 10^-9. We varied the learning rate over the course of training, increasing linearly for the first warmup_steps = 4000 training steps.',
    ],
    footerLeft: 'Section 4.1 — Optimization Schedule',
  },
  {
    page: 9,
    headerRight: 'Vaswani et al. — Attention Is All You Need',
    sectionTitle: '4.2 Regularization & Residual Dropout',
    paragraphs: [
      'We employ three types of regularization during training: residual dropout applied to the output of each sub-layer before it is added to the sub-layer input and normalized, plus dropout on the sums of the embeddings and positional encodings.',
      'During training, we employed label smoothing of value epsilon_ls = 0.1. This hurts perplexity, as the model learns to be more unsure, but improves accuracy and BLEU score.',
    ],
    footerLeft: 'Section 4.2 — Regularization',
  },
  {
    page: 10,
    headerRight: 'Vaswani et al. — Attention Is All You Need',
    sectionTitle: '5. Empirical Results',
    paragraphs: [
      'On the WMT 2014 English-to-German translation task, the big transformer model outperforms the best previously reported models including ensembles by more than 2.0 BLEU, establishing a new single-model state-of-the-art BLEU score of 28.4.',
      'Even our base model surpasses all previously published models and ensembles, at a fraction of the training cost of any of the competitive models.',
    ],
    footerLeft: 'Section 5 — Empirical Results',
  },
  {
    page: 11,
    headerRight: 'Vaswani et al. — Attention Is All You Need',
    sectionTitle: '5.1 Machine Translation Benchmarks',
    paragraphs: [
      'On the WMT 2014 English-to-French translation task, our big model achieves a BLEU score of 41.8, outperforming all of the previously published single models, at less than 1/4 the training cost of the previous state-of-the-art model.',
      'We used beam search with a beam size of 4 and length penalty alpha = 0.6. These hyperparameters were chosen after experimentation on the development set.',
    ],
    footerLeft: 'Section 5.1 — WMT Benchmarks',
  },
  {
    page: 12,
    headerRight: 'Vaswani et al. — Attention Is All You Need',
    sectionTitle: '5.2 Model Variations & Ablations',
    paragraphs: [
      'To evaluate the importance of different components of the Transformer, we varied our base model in different ways, measuring the change in performance on English-to-German translation on the development set, newstest2013.',
      'Single-head attention is 0.9 BLEU worse than the best setting, though quality also drops off with too many heads (h = 32).',
    ],
    footerLeft: 'Section 5.2 — Ablation Study',
  },
  {
    page: 13,
    headerRight: 'Vaswani et al. — Attention Is All You Need',
    sectionTitle: '5.3 English Constituency Parsing',
    paragraphs: [
      'To evaluate if the Transformer can generalize to other tasks we performed experiments on English constituency parsing. This task presents specific challenges: the output is subject to strong structural constraints and is significantly longer than the input.',
      'Our results show that despite the lack of task-specific tuning our model performs surprisingly well, yielding better results than all previously reported models with the exception of the Recurrent Neural Network Grammar.',
    ],
    footerLeft: 'Section 5.3 — Constituency Parsing',
  },
  {
    page: 14,
    headerRight: 'Vaswani et al. — Attention Is All You Need',
    sectionTitle: '6. Conclusion',
    paragraphs: [
      'In this work, we presented the Transformer, the first sequence transduction model based entirely on attention, replacing the recurrent layers most commonly used in encoder-decoder architectures with multi-headed self-attention.',
      'For translation tasks, the Transformer can be trained significantly faster than architectures based on recurrent or convolutional layers. We are excited about the future of attention-based models and plan to apply them to other tasks.',
    ],
    footerLeft: 'Section 6 — Conclusion',
  },
  {
    page: 15,
    headerRight: 'Vaswani et al. — Attention Is All You Need',
    sectionTitle: 'References & Attention Visualizations',
    paragraphs: [
      '[1] Jimmy Lei Ba, Jamie Ryan Kiros, and Geoffrey E Hinton. Layer normalization. arXiv preprint arXiv:1607.06450, 2016.',
      '[14] Jonas Gehring, Michael Auli, David Grangier, Denis Yarats, and Yann N. Dauphin. Convolutional sequence to sequence learning. ICML 2017.',
      '[31] Yonghui Wu et al. Google neural machine translation system: Bridging the gap between human and machine translation. arXiv:1609.08144, 2016.',
    ],
    footerLeft: 'References — arXiv:1706.03762v7',
  },
];

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const axios = require('axios');

const formatCoupon = (coupon) => {
  if (!coupon) return 'N/A';
  return `${coupon.code} (${coupon.discount}${coupon.type == 'percentage' ? '%' : coupon.type == 'fixed' ? coupon.currency : ''})`;
};

const formatCustomFields = (customFields) => {
  if (!customFields || Object.entries(customFields).length === 0) return 'N/A';
  return Object.entries(customFields)
    .map(([key, value]) => `${key}: "${value}"`)
    .join(', ');
};

const formatDelivered = (delivered) => {
  if (!delivered) return 'N/A';
  try {
    const data = JSON.parse(delivered);
    if (Array.isArray(data)) {
      return data.join(', ');
    }
    return delivered.toString();
  } catch {
    return delivered.toString();
  }
};

const formatGatewayInfo = (invoice) => {
  switch (invoice.gateway) {
    case 'CASHAPP':
      return `Transaction ID: "${invoice.cashapp_transaction_id || 'N/A'}"`;
    case 'STRIPE':
      return invoice.stripe_pi_id
        ? `[https://dashboard.stripe.com/payments/${invoice.stripe_pi_id}](https://dashboard.stripe.com/payments/${invoice.stripe_pi_id})`
        : 'N/A';
    case 'PAYPALFF':
      return invoice.paypalff_note ? `Note: "${invoice.paypalff_note}"` : 'N/A';
    case 'SUMUP':
      return invoice.sumup_checkout_id ? `Checkout ID: "${invoice.sumup_checkout_id}"` : 'N/A';
    case 'MOLLIE':
      return invoice.mollie_transaction_id ? `Payment ID: "${invoice.mollie_transaction_id}"` : 'N/A';
    case 'SKRILL':
      return invoice.skrill_transaction_id ? `Transaction ID: "${invoice.skrill_transaction_id}"` : 'N/A';
    default:
      return 'N/A';
  }
};

const getFieldValue = (template, invoice) => {
  return template
    .replace('{unique_id}', invoice.unique_id)
    .replace('{status}', invoice.status.replace(/_/g, ' '))
    .replace('{product_name}', invoice.product?.name || 'N/A')
    .replace('{variant_name}', invoice.variant?.name || 'N/A')
    .replace('{price}', invoice.price)
    .replace('{currency}', invoice.currency)
    .replace('{coupon}', formatCoupon(invoice.coupon))
    .replace('{email}', invoice.email)
    .replace('{custom_fields}', formatCustomFields(invoice.custom_fields))
    .replace('{gateway}', invoice.gateway)
    .replace('{gateway_info}', formatGatewayInfo(invoice))
    .replace('{delivered}', formatDelivered(invoice.delivered))
    .replace('{ip}', invoice.ip)
    .replace('{user_agent}', invoice.user_agent)
    .replace('{created_at_timestamp}', Math.floor(new Date(invoice.created_at).getTime() / 1000))
    .replace('{completed_at}', invoice.completed_at
      ? `<t:${Math.floor(new Date(invoice.completed_at).getTime() / 1000)}:F>`
      : 'N/A');
};

const data = new SlashCommandBuilder()
  .setName('invoice-view')
  .setDescription('View invoice details')
  .addStringOption((option) =>
    option.setName('id')
      .setDescription('The invoice ID to search for')
      .setRequired(true)
  );

async function execute(interaction, client, config) {
  const hasPermission = config.ALLOWED_USER_IDS.includes(interaction.user.id) ||
    interaction.member.roles.cache.some(role => config.ALLOWED_ROLE_IDS.includes(role.id));

  if (!hasPermission) {
    await interaction.reply({
      content: config.INVOICE_VIEW.ERROR_MESSAGES.NO_PERMISSION,
      flags: [MessageFlags.Ephemeral]
    });
    return;
  }

  const id = interaction.options.getString('id');
  let invoiceId = id;

  if (invoiceId.includes('-')) {
    invoiceId = invoiceId.split('-').pop();
    invoiceId = invoiceId.replace(/^0+/, '');
  }

  try {
    const response = await axios.get(
      `https://api.sellauth.com/v1/shops/${config.SA_SHOP_ID}/invoices/${invoiceId}`,
      {
        headers: {
          Authorization: `Bearer ${config.SA_API_KEY}`,
        },
        validateStatus: function (status) {
          return status < 500;
        }
      }
    );

    if (response.status === 404) {
      await interaction.reply({
        content: config.INVOICE_VIEW.ERROR_MESSAGES.NO_INVOICE.replace('{invoice_id}', id),
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    if (response.status !== 200) {
      await interaction.reply({
        content: config.INVOICE_VIEW.ERROR_MESSAGES.GENERAL_ERROR,
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    const invoice = response.data;

    const embed = new EmbedBuilder()
      .setTitle(config.INVOICE_VIEW.EMBED.TITLE)
      .setColor(config.INVOICE_VIEW.EMBED.COLOR);

    if (config.INVOICE_VIEW.EMBED.TIMESTAMP) {
      embed.setTimestamp();
    }

    if (config.INVOICE_VIEW.EMBED.IMAGE_URL) {
      embed.setImage(config.INVOICE_VIEW.EMBED.IMAGE_URL);
    }

    if (config.INVOICE_VIEW.EMBED.THUMBNAIL_URL) {
      embed.setThumbnail(config.INVOICE_VIEW.EMBED.THUMBNAIL_URL);
    }

    config.INVOICE_VIEW.EMBED.FIELDS.forEach(field => {
      embed.addFields({
        name: field.NAME,
        value: getFieldValue(field.VALUE, invoice),
      });
    });

    await interaction.reply({
      embeds: [embed]
    });

  } catch (error) {
    console.error('Error viewing invoice:', error);
    await interaction.reply({
      content: config.INVOICE_VIEW.ERROR_MESSAGES.GENERAL_ERROR,
      flags: [MessageFlags.Ephemeral]
    });
  }
}

module.exports = { data, execute };
# 1C Biznes Analitika — Telegram Agent

## Qurulum (4 addım)

### Addım 1 — Telegram Bot yarat
1. [@BotFather](https://t.me/BotFather)-a gedin
2. `/newbot` yazın
3. Ad verin (məs: `ŞirkətAdı Maliyyə`)
4. Token-i kopyalayın → saxlayın

### Addım 2 — 1C OData-nı aktivləşdir
1C-də: **Administrasiya → İnternet Xidmətləri → OData-nı yandırın**

Test edin (brauzerdə açın):
```
http://YOUR_SERVER/1c/odata/standard.odata/$metadata
```
Əgər XML görürsünüzsə — işləyir ✅

### Addım 3 — Vercel Deploy

1. Bu faylları GitHub repo-ya əlavə edin
2. [vercel.com](https://vercel.com) → "Import Project"
3. **Environment Variables** bölməsinə bu dəyişənləri əlavə edin:

| Dəyişən | Dəyər |
|---------|-------|
| `TELEGRAM_TOKEN` | BotFather-dən aldığınız token |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com)-dan |
| `C1_BASE_URL` | `http://192.168.1.100` (1C serverinizin IP-si) |
| `C1_USERNAME` | 1C istifadəçi adı |
| `C1_PASSWORD` | 1C şifrəsi |
| `ALLOWED_CHAT_IDS` | Telegram chat ID-ləri (vergüllə): `123456789,987654321` |

4. Deploy düyməsinə basın

### Addım 4 — Webhook qeydiyyatı

Deploy tamamlandıqdan sonra brauzerdə açın:
```
https://api.telegram.org/botTOKEN/setWebhook?url=https://LAYIHE.vercel.app/api/webhook
```

## 1C-dəki əsas endpoint-lər

| Məlumat | 1C endpoint |
|---------|------------|
| Satışlar | `Document_ПродажаТоваровУслуг` |
| Anbar qalığı | `AccumulationRegister_ТоварыНаСкладах/Balance()` |
| Mənfəət/Zərər | `AccumulationRegister_ДоходыИРасходы/Balance()` |
| Debitor borclar | `AccumulationRegister_РасчетыСКлиентами/Balance()` |
| Top məhsullar | `AccumulationRegister_Продажи/Balance()` |

## Chat ID necə tapılır?
Bota `/start` yazın, sonra:
```
https://api.telegram.org/botTOKEN/getUpdates
```

## Agent nə edə bilər?

- "Bu ay satışlar necədir?" → Analiz + keçən ay müqayisəsi
- "Ən çox satan 10 məhsul?" → Top siyahı + mənfəət marjası
- "Anbar vəziyyəti?" → Kritik məhsullar + sifariş tövsiyəsi
- "Debitor borclar nə qədərdir?" → Müştəri borcları siyahısı
- "Bu rübdə mənfəət/zərər?" → P&L hesabatı

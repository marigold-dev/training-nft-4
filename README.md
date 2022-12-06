# training-nft-4

Training n°4 for NFT marketplace

![https://france-vins.eu/wp-content/uploads/2018/10/les-meilleures-caves-%C3%A0-vin-image.jpg](https://france-vins.eu/wp-content/uploads/2018/10/les-meilleures-caves-%C3%A0-vin-image.jpg)

We finish by using multi asset template.

- you have unlimited NFT collections
- you have unlimited quantity of items in each collection

To resume, you are producting any quantity of wine bottles on n collections

# :arrow_forward: Go forward

Keep your code from previous training or get the solution [here](https://github.com/marigold-dev/training-nft-3/tree/main/solution)

> If you clone/fork a repo, rebuild in local

```bash
npm i
cd ./app
yarn install
cd ..
```

# :scroll: Smart contract

## Do breaking changes on nft template to fit with the new library

Point to the new template changing the first import line to

```jsligo
#import "@ligo/fa/lib/fa2/asset/multi_asset.jsligo" "MULTIASSET"
```

It means you will change the namespace from `SINGLEASSET` to `MULTIASSET` everywhere (like this you are sure to use the correct library)

You will introduce the token_id back as there a several collections now.
We can remove `totalSupply` and add two extra key sets `owner_token_ids` and `token_ids`

Change the storage definition

```jsligo
type offer = {
  quantity : nat,
  price : nat
};

type storage =
  {
    administrators: set<address>,
    offers: map<[address,nat],offer>,  //user sells an offer for a token_id
    ledger: MULTIASSET.Ledger.t,
    metadata: MULTIASSET.Metadata.t,
    token_metadata: MULTIASSET.TokenMetadata.t,
    operators: MULTIASSET.Operators.t,
    owner_token_ids : set<[MULTIASSET.Storage.owner,MULTIASSET.Storage.token_id]>,
    token_ids : set<MULTIASSET.Storage.token_id>
  };
```

Update `parameter` type too

```jsligo
type parameter =
  | ["Mint", nat,nat,bytes,bytes,bytes,bytes] //token_id, quantity, name , description ,version ,symbol , bytesipfsUrl
  | ["AddAdministrator" , address]
  | ["Buy", nat,nat, address]  //buy token_id,quantity at a seller offer price
  | ["Sell", nat,nat, nat]  //sell token_id,quantity at a price
  | ["Transfer", MULTIASSET.transfer]
  | ["Balance_of", MULTIASSET.balance_of]
  | ["Update_operators", MULTIASSET.update_operators];
```

Update `mint` function

```jsligo
const mint = (token_id : nat, quantity: nat, name : bytes, description : bytes,symbol : bytes, ipfsUrl: bytes, s: storage) : ret => {

   if(quantity <= (0 as nat)) return failwith("0");

   if(! Set.mem(Tezos.get_sender(), s.administrators)) return failwith("1");

   const token_info: map<string, bytes> =
     Map.literal(list([
      ["name", name],
      ["description",description],
      ["interfaces", (bytes `["TZIP-12"]`)],
      ["thumbnailUri", ipfsUrl],
      ["symbol",symbol],
      ["decimals", (bytes `0`)]
     ])) as map<string, bytes>;


    const metadata : bytes = bytes
  `{
      "name":"FA2 NFT Marketplace",
      "description":"Example of FA2 implementation",
      "version":"0.0.1",
      "license":{"name":"MIT"},
      "authors":["Marigold<contact@marigold.dev>"],
      "homepage":"https://marigold.dev",
      "source":{
        "tools":["Ligo"],
        "location":"https://github.com/ligolang/contract-catalogue/tree/main/lib/fa2"},
      "interfaces":["TZIP-012"],
      "errors": [],
      "views": []
      }` ;

    return [list([]) as list<operation>,
          {...s,
     ledger: Big_map.add([Tezos.get_sender(),token_id],quantity as nat,s.ledger) as MULTIASSET.Ledger.t,
     metadata : Big_map.literal(list([["",  bytes `tezos-storage:data`],["data", metadata]])),
     token_metadata: Big_map.add(token_id, {token_id: token_id,token_info:token_info},s.token_metadata),
     operators: Big_map.empty as MULTIASSET.Operators.t,
     owner_token_ids : Set.add([Tezos.get_sender(),token_id],s.owner_token_ids),
     token_ids: Set.add(token_id, s.token_ids)}]};
```

`sell` function

```jsligo
const sell = (token_id : nat, quantity: nat, price: nat, s: storage) : ret => {

  //check balance of seller
  const sellerBalance = MULTIASSET.Ledger.get_for_user(s.ledger,Tezos.get_source(),token_id);
  if(quantity > sellerBalance) return failwith("2");

  //need to allow the contract itself to be an operator on behalf of the seller
  const newOperators = MULTIASSET.Operators.add_operator(s.operators,Tezos.get_source(),Tezos.get_self_address(),token_id);

  //DECISION CHOICE: if offer already exists, we just override it
  return [list([]) as list<operation>,{...s,offers:Map.add([Tezos.get_source(),token_id],{quantity : quantity, price : price},s.offers),operators:newOperators}];
};
```

`buy`function

```jsligo
const buy = (token_id : nat, quantity: nat, seller: address, s: storage) : ret => {

  //search for the offer
  return match( Map.find_opt([seller,token_id],s.offers) , {
    None : () => failwith("3"),
    Some : (offer : offer) => {

      //check if amount have been paid enough
      if(Tezos.get_amount() < offer.price  * (1 as mutez)) return failwith("5");

      // prepare transfer of XTZ to seller
      const op = Tezos.transaction(unit,offer.price  * (1 as mutez),Tezos.get_contract_with_error(seller,"6"));

      //transfer tokens from seller to buyer
      let ledger = MULTIASSET.Ledger.decrease_token_amount_for_user(s.ledger,seller,token_id,quantity);
      ledger = MULTIASSET.Ledger.increase_token_amount_for_user(ledger,Tezos.get_source(),token_id,quantity);

      //update new offer
      const newOffer = {...offer,quantity : abs(offer.quantity - quantity)};

      return [list([op]) as list<operation>, {...s, offers : Map.update([seller,token_id],Some(newOffer),s.offers), ledger : ledger, owner_token_ids : Set.add([Tezos.get_source(),token_id],s.owner_token_ids) }];
    }
  });
};
```

and finally the `main`

```jsligo
const main = ([p, s]: [parameter,storage]): ret =>
    match(p, {
     Mint: (p: [nat,nat,bytes, bytes, bytes, bytes,bytes]) => mint(p[0],p[1],p[2],p[3],p[4],p[5], s),
     AddAdministrator : (p : address) => {if(Set.mem(Tezos.get_sender(), s.administrators)){ return [list([]),{...s,administrators:Set.add(p, s.administrators)}]} else {return failwith("1");}} ,
     Buy: (p : [nat,nat,address]) => buy(p[0],p[1],p[2],s),
     Sell: (p : [nat,nat,nat]) => sell(p[0],p[1],p[2],s),
     Transfer: (p: MULTIASSET.transfer) => {
      const ret2 : [list<operation>, MULTIASSET.storage] = MULTIASSET.transfer(p,{ledger:s.ledger,metadata:s.metadata,token_metadata:s.token_metadata,operators:s.operators,owner_token_ids:s.owner_token_ids,token_ids:s.token_ids});
      return [ret2[0],{...s,ledger:ret2[1].ledger,metadata:ret2[1].metadata,token_metadata:ret2[1].token_metadata,operators:ret2[1].operators,owner_token_ids:ret2[1].owner_token_ids,token_ids:ret2[1].token_ids}];
     },
     Balance_of: (p: MULTIASSET.balance_of) => {
      const ret2 : [list<operation>, MULTIASSET.storage] = MULTIASSET.balance_of(p,{ledger:s.ledger,metadata:s.metadata,token_metadata:s.token_metadata,operators:s.operators,owner_token_ids:s.owner_token_ids,token_ids:s.token_ids});
      return [ret2[0],{...s,ledger:ret2[1].ledger,metadata:ret2[1].metadata,token_metadata:ret2[1].token_metadata,operators:ret2[1].operators,owner_token_ids:ret2[1].owner_token_ids,token_ids:ret2[1].token_ids}];
      },
     Update_operators: (p: MULTIASSET.update_operator) => {
      const ret2 : [list<operation>, MULTIASSET.storage] = MULTIASSET.update_ops(p,{ledger:s.ledger,metadata:s.metadata,token_metadata:s.token_metadata,operators:s.operators,owner_token_ids:s.owner_token_ids,token_ids:s.token_ids});
      return [ret2[0],{...s,ledger:ret2[1].ledger,metadata:ret2[1].metadata,token_metadata:ret2[1].token_metadata,operators:ret2[1].operators,owner_token_ids:ret2[1].owner_token_ids,token_ids:ret2[1].token_ids}];
      }
     });
```

Change the initial storage to

```jsligo
#include "nft.jsligo"
const default_storage =
{
    administrators: Set.literal(list(["tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb" as address])) as set<address>,
    offers: Map.empty as map<[address,nat],offer>,
    ledger: Big_map.empty as MULTIASSET.Ledger.t,
    metadata: Big_map.empty as MULTIASSET.Metadata.t,
    token_metadata: Big_map.empty as MULTIASSET.TokenMetadata.t,
    operators: Big_map.empty as MULTIASSET.Operators.t,
    owner_token_ids : Set.empty as set<[MULTIASSET.Storage.owner,MULTIASSET.Storage.token_id]>,
    token_ids : Set.empty as set<MULTIASSET.Storage.token_id>
  }
;
```

Compile again and deploy to ghostnet

```bash
TAQ_LIGO_IMAGE=ligolang/ligo:0.56.0 taq compile nft.jsligo
taq deploy nft.tz -e "testing"
```

```logs
┌──────────┬──────────────────────────────────────┬───────┬──────────────────┬────────────────────────────────┐
│ Contract │ Address                              │ Alias │ Balance In Mutez │ Destination                    │
├──────────┼──────────────────────────────────────┼───────┼──────────────────┼────────────────────────────────┤
│ nft.tz   │ KT1FTriL78AFoHSV6861S6JHnRC3XgWF351a │ nft   │ 0                │ https://ghostnet.ecadinfra.com │
└──────────┴──────────────────────────────────────┴───────┴──────────────────┴────────────────────────────────┘
```

:tada: Hooray ! We have finished the backend :tada:

# :performing_arts: NFT Marketplace front

Generate Typescript classes and go to the frontend to run the server

```bash
taq generate types ./app/src
cd ./app
yarn install
yarn run start
```

## Update in `App.tsx`

We just need to fetch the token_id == 0.
Replace the function `refreshUserContextOnPageReload` by

```typescript
const refreshUserContextOnPageReload = async () => {
  console.log("refreshUserContext");
  //CONTRACT
  try {
    let c = await Tezos.contract.at(nftContractAddress, tzip12);
    console.log("nftContractAddress", nftContractAddress);

    let nftContrat: NftWalletType = await Tezos.wallet.at<NftWalletType>(
      nftContractAddress
    );
    const storage = (await nftContrat.storage()) as Storage;
    await Promise.all(
      storage.token_ids.map(async (token_id: nat) => {
        let tokenMetadata: TZIP21TokenMetadata = (await c
          .tzip12()
          .getTokenMetadata(token_id.toNumber())) as TZIP21TokenMetadata;
        nftContratTokenMetadataMap.set(token_id.toNumber(), tokenMetadata);
      })
    );
    setNftContratTokenMetadataMap(new Map(nftContratTokenMetadataMap)); //new Map to force refresh
    setNftContrat(nftContrat);
    setStorage(storage);
  } catch (error) {
    console.log("error refreshing nft contract: ", error);
  }

  //USER
  const activeAccount = await wallet.client.getActiveAccount();
  if (activeAccount) {
    setUserAddress(activeAccount.address);
    const balance = await Tezos.tz.getBalance(activeAccount.address);
    setUserBalance(balance.toNumber());
  }

  console.log("refreshUserContext ended.");
};
```

Don't forget the import

```typescript
import { nat } from "./type-aliases";
```

## Update in `MintPage.tsx`

Just update the `mint` call adding the missing quantity, and add back the token_id counter incrementer

```typescript

  useEffect(() => {
    (async () => {
      if (storage && storage.token_ids.length > 0) {
        formik.setFieldValue("token_id", storage?.token_ids.length);
      }
    })();
  }, [storage?.token_ids]);

...
const op = await nftContrat!.methods
  .mint(
    new BigNumber(newTokenDefinition.token_id) as nat,
    new BigNumber(newTokenDefinition.quantity) as nat,
    char2Bytes(newTokenDefinition.name!) as bytes,
    char2Bytes(newTokenDefinition.description!) as bytes,
    char2Bytes(newTokenDefinition.symbol!) as bytes,
    char2Bytes(thumbnailUri) as bytes
  )
  .send();
  ...
```

Don't forget to add missing imports `useEffect` and `storage`

```typescript
import React, { Fragment, useEffect, useState } from "react";

...

export default function MintPage() {
  const {
    nftContrat,
    refreshUserContextOnPageReload,
    nftContratTokenMetadataMap,
    storage,
  } = React.useContext(UserContext) as UserContextType;
```

## Update in `OffersPage.tsx`

Copy the whole content here

```typescript
import SellIcon from "@mui/icons-material/Sell";
import {
  Avatar,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  TextField,
} from "@mui/material";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import BigNumber from "bignumber.js";
import { useFormik } from "formik";
import { useSnackbar } from "notistack";
import React, { Fragment, useEffect } from "react";
import * as yup from "yup";
import { UserContext, UserContextType } from "./App";
import { TransactionInvalidBeaconError } from "./TransactionInvalidBeaconError";
import { address, nat } from "./type-aliases";

const validationSchema = yup.object({
  price: yup
    .number()
    .required("Price is required")
    .positive("ERROR: The number must be greater than 0!"),
  quantity: yup
    .number()
    .required("Quantity is required")
    .positive("ERROR: The number must be greater than 0!"),
});

type Offer = {
  price: nat;
  quantity: nat;
};

export default function OffersPage() {
  const [selectedTokenId, setSelectedTokenId] = React.useState<number>(0);

  let [offersTokenIDMap, setOffersTokenIDMap] = React.useState<Map<nat, Offer>>(
    new Map()
  );
  let [ledgerTokenIDMap, setLedgerTokenIDMap] = React.useState<Map<nat, nat>>(
    new Map()
  );

  const {
    nftContrat,
    nftContratTokenMetadataMap,
    userAddress,
    storage,
    refreshUserContextOnPageReload,
  } = React.useContext(UserContext) as UserContextType;

  const { enqueueSnackbar } = useSnackbar();

  const formik = useFormik({
    initialValues: {
      price: 0,
      quantity: 1,
    },
    validationSchema: validationSchema,
    onSubmit: (values) => {
      console.log("onSubmit: (values)", values, selectedTokenId);
      sell(selectedTokenId, values.quantity, values.price);
    },
  });

  const initPage = async () => {
    if (storage) {
      console.log("context is not empty, init page now");
      ledgerTokenIDMap = new Map();
      offersTokenIDMap = new Map();

      await Promise.all(
        storage.owner_token_ids.map(async (element) => {
          if (element[0] === userAddress) {
            const ownerBalance = await storage.ledger.get({
              0: userAddress as address,
              1: element[1],
            });
            if (ownerBalance != BigNumber(0))
              ledgerTokenIDMap.set(element[1], ownerBalance);
            const ownerOffers = await storage.offers.get({
              0: userAddress as address,
              1: element[1],
            });
            if (ownerOffers && ownerOffers.quantity != BigNumber(0))
              offersTokenIDMap.set(element[1], ownerOffers);

            console.log(
              "found for " +
                element[0] +
                " on token_id " +
                element[1] +
                " with balance " +
                ownerBalance
            );
          } else {
            console.log("skip to next owner");
          }
        })
      );
      setLedgerTokenIDMap(new Map(ledgerTokenIDMap)); //force refresh
      setOffersTokenIDMap(new Map(offersTokenIDMap)); //force refresh

      console.log("ledgerTokenIDMap", ledgerTokenIDMap);
    } else {
      console.log("context is empty, wait for parent and retry ...");
    }
  };

  useEffect(() => {
    (async () => {
      console.log("after a storage changed");
      await initPage();
    })();
  }, [storage]);

  useEffect(() => {
    (async () => {
      console.log("on Page init");
      await initPage();
    })();
  }, []);

  const sell = async (token_id: number, quantity: number, price: number) => {
    try {
      const op = await nftContrat?.methods
        .sell(
          BigNumber(token_id) as nat,
          BigNumber(quantity) as nat,
          BigNumber(price * 1000000) as nat //to mutez
        )
        .send();

      await op?.confirmation(2);

      enqueueSnackbar(
        "Wine collection (token_id=" +
          token_id +
          ") offer for " +
          quantity +
          " units at price of " +
          price +
          " XTZ",
        { variant: "success" }
      );

      refreshUserContextOnPageReload(); //force all app to refresh the context
    } catch (error) {
      console.table(`Error: ${JSON.stringify(error, null, 2)}`);
      let tibe: TransactionInvalidBeaconError =
        new TransactionInvalidBeaconError(error);
      enqueueSnackbar(tibe.data_message, {
        variant: "error",
        autoHideDuration: 10000,
      });
    }
  };

  return (
    <Box
      component="main"
      sx={{
        flex: 1,
        py: 6,
        px: 4,
        bgcolor: "#eaeff1",
        backgroundImage:
          "url(https://en.vinex.market/skin/default/images/banners/home/new/banner-1180.jpg)",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }}
    >
      <Paper sx={{ maxWidth: 936, margin: "auto", overflow: "hidden" }}>
        {ledgerTokenIDMap && ledgerTokenIDMap.size != 0 ? (
          Array.from(ledgerTokenIDMap.entries()).map(([token_id, balance]) => (
            <Card key={userAddress + "-" + token_id.toString()}>
              <CardHeader
                avatar={
                  <Avatar sx={{ bgcolor: "purple" }} aria-label="recipe">
                    {token_id.toString()}
                  </Avatar>
                }
                title={
                  nftContratTokenMetadataMap.get(token_id.toNumber())?.name
                }
              />

              <CardContent>
                <div>{"Owned : " + balance.toNumber()}</div>
                {offersTokenIDMap.get(token_id) ? (
                  <div>
                    {"Offer : " +
                      offersTokenIDMap.get(token_id)?.quantity +
                      " at price " +
                      offersTokenIDMap.get(token_id)?.price.dividedBy(1000000) +
                      " XTZ/bottle"}
                  </div>
                ) : (
                  ""
                )}
              </CardContent>

              <CardActions disableSpacing>
                <form
                  onSubmit={(values) => {
                    setSelectedTokenId(token_id.toNumber());
                    formik.handleSubmit(values);
                  }}
                >
                  <TextField
                    name="quantity"
                    label="quantity"
                    placeholder="Enter a quantity"
                    variant="standard"
                    type="number"
                    value={formik.values.quantity}
                    onChange={formik.handleChange}
                    error={
                      formik.touched.quantity && Boolean(formik.errors.quantity)
                    }
                    helperText={
                      formik.touched.quantity && formik.errors.quantity
                    }
                  />
                  <TextField
                    name="price"
                    label="price/bottle (XTZ)"
                    placeholder="Enter a price"
                    variant="standard"
                    type="number"
                    value={formik.values.price}
                    onChange={formik.handleChange}
                    error={formik.touched.price && Boolean(formik.errors.price)}
                    helperText={formik.touched.price && formik.errors.price}
                  />
                  <Button type="submit" aria-label="add to favorites">
                    <SellIcon /> SELL
                  </Button>
                </form>
              </CardActions>
            </Card>
          ))
        ) : (
          <Fragment />
        )}
      </Paper>
    </Box>
  );
}
```

## Update in `WineCataloguePage.tsx`

Copy the whole content here

```typescript
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import {
  Avatar,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  TextField,
} from "@mui/material";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import BigNumber from "bignumber.js";
import { useFormik } from "formik";
import { useSnackbar } from "notistack";
import React, { Fragment } from "react";
import * as yup from "yup";
import { UserContext, UserContextType } from "./App";
import { TransactionInvalidBeaconError } from "./TransactionInvalidBeaconError";
import { address, nat } from "./type-aliases";

type OfferEntry = [{ 0: address; 1: nat }, Offer];

type Offer = {
  price: nat;
  quantity: nat;
};

const validationSchema = yup.object({
  quantity: yup
    .number()
    .required("Quantity is required")
    .positive("ERROR: The number must be greater than 0!"),
});

export default function WineCataloguePage() {
  const {
    nftContrat,
    nftContratTokenMetadataMap,
    refreshUserContextOnPageReload,
    storage,
  } = React.useContext(UserContext) as UserContextType;
  const [selectedOfferEntry, setSelectedOfferEntry] =
    React.useState<OfferEntry | null>(null);

  const formik = useFormik({
    initialValues: {
      quantity: 1,
    },
    validationSchema: validationSchema,
    onSubmit: (values) => {
      console.log("onSubmit: (values)", values, selectedOfferEntry);
      buy(values.quantity, selectedOfferEntry!);
    },
  });
  const { enqueueSnackbar } = useSnackbar();

  const buy = async (quantity: number, selectedOfferEntry: OfferEntry) => {
    try {
      const op = await nftContrat?.methods
        .buy(
          selectedOfferEntry[0][1],
          BigNumber(quantity) as nat,
          selectedOfferEntry[0][0]
        )
        .send({
          amount: quantity * selectedOfferEntry[1].price.toNumber(),
          mutez: true,
        });

      await op?.confirmation(2);

      enqueueSnackbar(
        "Bought " +
          quantity +
          " unit of Wine collection (token_id:" +
          selectedOfferEntry[0][1] +
          ")",
        {
          variant: "success",
        }
      );

      refreshUserContextOnPageReload(); //force all app to refresh the context
    } catch (error) {
      console.table(`Error: ${JSON.stringify(error, null, 2)}`);
      let tibe: TransactionInvalidBeaconError =
        new TransactionInvalidBeaconError(error);
      enqueueSnackbar(tibe.data_message, {
        variant: "error",
        autoHideDuration: 10000,
      });
    }
  };

  return (
    <Box
      component="main"
      sx={{
        flex: 1,
        py: 6,
        px: 4,
        bgcolor: "#eaeff1",
        backgroundImage:
          "url(https://en.vinex.market/skin/default/images/banners/home/new/banner-1180.jpg)",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }}
    >
      <Paper sx={{ maxWidth: 936, margin: "auto", overflow: "hidden" }}>
        {storage?.offers && storage?.offers.size != 0 ? (
          Array.from(storage?.offers.entries())
            .filter(([key, offer]) => offer.quantity.isGreaterThan(0))
            .map(([key, offer]) => (
              <Card key={key[0] + "-" + key[1].toString()}>
                <CardHeader
                  avatar={
                    <Avatar sx={{ bgcolor: "purple" }} aria-label="recipe">
                      {key[1].toString()}
                    </Avatar>
                  }
                  title={
                    nftContratTokenMetadataMap.get(key[1].toNumber())?.name
                  }
                  subheader={"seller : " + key[0]}
                />

                <CardContent>
                  <div>
                    {"Offer : " +
                      offer.quantity +
                      " at price " +
                      offer.price.dividedBy(1000000) +
                      " XTZ/bottle"}
                  </div>
                </CardContent>

                <CardActions disableSpacing>
                  <form
                    onSubmit={(values) => {
                      setSelectedOfferEntry([key, offer]);
                      formik.handleSubmit(values);
                    }}
                  >
                    <TextField
                      name="quantity"
                      label="quantity"
                      placeholder="Enter a quantity"
                      variant="standard"
                      type="number"
                      value={formik.values.quantity}
                      onChange={formik.handleChange}
                      error={
                        formik.touched.quantity &&
                        Boolean(formik.errors.quantity)
                      }
                      helperText={
                        formik.touched.quantity && formik.errors.quantity
                      }
                    />
                    <Button type="submit" aria-label="add to favorites">
                      <ShoppingCartIcon /> BUY
                    </Button>
                  </form>
                </CardActions>
              </Card>
            ))
        ) : (
          <Fragment />
        )}
      </Paper>
    </Box>
  );
}
```

## Let's play

1. Connect with your wallet an choose `alice` account (or one of the administrators you set on the smart contract earlier). You are redirected to the Administration /mint page as there is no nft minted yet
2. Enter these values on the form for example :

- name : Saint Emilion - Franc la Rose
- symbol : SEMIL
- description : Grand cru 2007
- quantity : 1000

3. Click on `Upload an image` an select a bottle picture on your computer
4. Click on Mint button

Your picture will be pushed to IPFS and will display, then you are asked to sign the mint operation

- Confirm operation
- Wait less than 1 minutes until you get the confirmation notification, the page will refresh automatically

Now you can see the `Trading` menu and the `Bottle offers` sub menu

Click on the sub-menu entry

You are owner of this bottle so you can make an offer on it

- Enter a quantity
- Enter a price offer
- Click on `SELL` button
- Wait a bit for the confirmation, then it refreshes and you have an offer attached to your NFT

For buying,

- Disconnect from your user and connect with another account (who has enough XTZ to buy at least 1 bottle)
- The logged buyer can see that alice is selling some bottles from the unique collection
- Buy some bottles while clicking on `BUY` button
- Wait for the confirmation, then the offer is updated on the market (depending how many bottle you bought)
- Click on `bottle offers` sub menu
- You are now the owner of some bottles, you can resell a part of it at your own price, etc ...

For adding more collections, go to the Mint page and repeat the process

# :palm_tree: Conclusion :sun_with_face:

You are able to play with an any NFT template from the ligo library.

Congratulations !

//TODO FA2.1 ???

//TODO pictures to include everywhere
